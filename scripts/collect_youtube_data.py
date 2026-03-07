#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
YouTube 일별 조회수/추정 수익 수집 (OAuth 없이)
- YouTube Data API v3 channels.list 로 누적 조회수(viewCount) 스냅샷 수집
- 전일 대비 증분(Δ)으로 일별 조회수 생성
- 누락일이 있으면 Δ를 균등 분배(추정)해서 여러 날짜로 나눠 저장
- Google Sheets '일별데이터'에 저장:
  A date (KST 기준) | B channel_id | C channel_name | D views(Δ) | E revenue(추정) | F rpm(고정) | G cumulative_views(스냅샷/추정) | H collected_at
"""

import os
import json
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from google.oauth2 import service_account
from googleapiclient.discovery import build


SHEET_MANAGE = "채널관리"
SHEET_DAILY = "일별데이터"

KST = ZoneInfo("Asia/Seoul")


def kst_today_ymd() -> str:
    return datetime.now(KST).strftime("%Y-%m-%d")


def now_iso_kst() -> str:
    return datetime.now(KST).isoformat(timespec="seconds")


def parse_ymd(s: str):
    try:
        return datetime.strptime(s, "%Y-%m-%d").date()
    except Exception:
        return None


def get_sheets_service(sa_json: str):
    info = json.loads(sa_json)
    scopes = ["https://www.googleapis.com/auth/spreadsheets"]
    creds = service_account.Credentials.from_service_account_info(info, scopes=scopes)
    return build("sheets", "v4", credentials=creds)


def get_youtube_service(api_key: str):
    # OAuth 없이 API Key로만 접근 (공개 통계: viewCount 등)
    return build("youtube", "v3", developerKey=api_key)


def ensure_daily_header(sheets, spreadsheet_id: str):
    """
    A~H 헤더를 보정해서 G/H 컬럼이 없더라도 정상 동작하게 함.
    """
    target_header = [
        "date",
        "channel_id",
        "channel_name",
        "views",
        "revenue",
        "rpm",
        "cumulative_views",
        "collected_at",
    ]

    res = sheets.spreadsheets().values().get(
        spreadsheetId=spreadsheet_id,
        range=f"{SHEET_DAILY}!A1:H1",
    ).execute()

    header = (res.get("values") or [[]])[0]
    # 헤더가 비었거나 길이가 짧으면 업데이트
    if header != target_header:
        sheets.spreadsheets().values().update(
            spreadsheetId=spreadsheet_id,
            range=f"{SHEET_DAILY}!A1:H1",
            valueInputOption="RAW",
            body={"values": [target_header]},
        ).execute()


def load_channels_from_manage(sheets, spreadsheet_id: str):
    """
    '채널관리' A:B 에서 channel_id, channel_name 로드
    """
    res = sheets.spreadsheets().values().get(
        spreadsheetId=spreadsheet_id,
        range=f"{SHEET_MANAGE}!A:B",
    ).execute()

    values = res.get("values", [])
    if len(values) <= 1:
        raise RuntimeError("'채널관리' 시트에 채널이 없습니다. (헤더 아래 최소 1행 필요)")

    rows = values[1:]
    channels = []
    for r in rows:
        cid = (r[0] if len(r) > 0 else "").strip()
        cname = (r[1] if len(r) > 1 else "").strip()
        if not cid:
            continue
        channels.append({"channel_id": cid, "channel_name": cname})
    if not channels:
        raise RuntimeError("'채널관리'에서 유효한 channel_id를 찾지 못했습니다.")
    return channels


def load_latest_per_channel(sheets, spreadsheet_id: str):
    """
    '일별데이터' A:H를 읽어서 채널별 최신(date 기준) 레코드(누적 조회수 포함)를 찾음.
    반환:
      latest[channel_id] = {"date": date_obj, "date_str": "...", "cumulative": int}
      existing_keys = set((date_str, channel_id))
    """
    res = sheets.spreadsheets().values().get(
        spreadsheetId=spreadsheet_id,
        range=f"{SHEET_DAILY}!A:H",
    ).execute()

    values = res.get("values", [])
    existing_keys = set()
    latest = {}

    if len(values) <= 1:
        return latest, existing_keys

    for row in values[1:]:
        if len(row) < 2:
            continue
        date_str = (row[0] if len(row) > 0 else "").strip()
        cid = (row[1] if len(row) > 1 else "").strip()
        if not date_str or not cid:
            continue

        existing_keys.add((date_str, cid))

        d = parse_ymd(date_str)
        if not d:
            continue

        cum = None
        if len(row) >= 7:
            try:
                cum = int(str(row[6]).replace(",", "").strip())
            except Exception:
                cum = None

        prev = latest.get(cid)
        if (prev is None) or (d > prev["date"]):
            latest[cid] = {"date": d, "date_str": date_str, "cumulative": cum}

    return latest, existing_keys


def chunk(lst, size):
    for i in range(0, len(lst), size):
        yield lst[i : i + size]


def fetch_channel_stats(youtube, channel_ids):
    """
    channels.list는 id를 콤마로 묶어서 여러 채널을 한 번에 가져올 수 있음.
    (실무 관례상 50개 단위로 끊는 편이 안전)
    """
    stats = {}
    for batch in chunk(channel_ids, 50):
        resp = youtube.channels().list(
            part="snippet,statistics",
            id=",".join(batch),
            maxResults=50,
        ).execute()

        for item in resp.get("items", []):
            cid = item.get("id")
            snippet = item.get("snippet", {}) or {}
            statistics = item.get("statistics", {}) or {}
            title = snippet.get("title", "")
            view_count = statistics.get("viewCount")

            if cid and view_count is not None:
                try:
                    view_count_int = int(view_count)
                except Exception:
                    continue
                stats[cid] = {"title": title, "cumulative_views": view_count_int}
    return stats


def split_delta_evenly(delta_total: int, days: int):
    """
    delta_total을 days일에 균등 분배(정수), 합계 보존.
    예: 10을 3일 => [4,3,3]
    """
    if days <= 0:
        return []
    base = delta_total // days
    rem = delta_total % days
    out = []
    for i in range(days):
        out.append(base + (1 if i < rem else 0))
    return out


def append_rows(sheets, spreadsheet_id: str, rows):
    if not rows:
        return
    sheets.spreadsheets().values().append(
        spreadsheetId=spreadsheet_id,
        range=f"{SHEET_DAILY}!A:H",
        valueInputOption="RAW",
        body={"values": rows},
    ).execute()


def main():
    spreadsheet_id = os.environ.get("SPREADSHEET_ID")
    sa_json = os.environ.get("GOOGLE_SERVICE_ACCOUNT_JSON")
    youtube_api_key = os.environ.get("YOUTUBE_API_KEY")
    default_rpm = int(os.environ.get("DEFAULT_RPM", "140"))

    if not spreadsheet_id:
        raise SystemExit("ERROR: SPREADSHEET_ID not set")
    if not sa_json:
        raise SystemExit("ERROR: GOOGLE_SERVICE_ACCOUNT_JSON not set")
    if not youtube_api_key:
        raise SystemExit("ERROR: YOUTUBE_API_KEY not set")

    today_str = kst_today_ymd()
    today_date = parse_ymd(today_str)
    collected_at = now_iso_kst()

    sheets = get_sheets_service(sa_json)
    youtube = get_youtube_service(youtube_api_key)

    # 헤더 보정 (G/H 포함)
    ensure_daily_header(sheets, spreadsheet_id)

    # 채널 목록
    channels = load_channels_from_manage(sheets, spreadsheet_id)
    channel_ids = [c["channel_id"] for c in channels]

    # 기존 최신값
    latest, existing_keys = load_latest_per_channel(sheets, spreadsheet_id)

    # 누적 스냅샷 가져오기 (배치)
    stats_map = fetch_channel_stats(youtube, channel_ids)

    rows_to_append = []
    added = 0
    skipped = 0

    for c in channels:
        cid = c["channel_id"]
        sheet_name = c.get("channel_name", "").strip()
        api_stat = stats_map.get(cid)

        if not api_stat:
            print(f"[WARN] channel not found via API: {cid} (skip)")
            continue

        channel_title = (sheet_name or api_stat.get("title") or "").strip()
        today_cum = api_stat["cumulative_views"]

        # 이미 오늘이 있으면 스킵(중복 방지)
        if (today_str, cid) in existing_keys:
            skipped += 1
            continue

        prev = latest.get(cid)
        if not prev or prev.get("cumulative") is None or prev.get("date") is None:
            # 첫 기록(기준점 만들기): 오늘 누적만 저장, Δ는 0
            views_delta = 0
            revenue = 0
            rows_to_append.append([
                today_str, cid, channel_title, views_delta, revenue, default_rpm, today_cum, collected_at
            ])
            added += 1
            continue

        last_date = prev["date"]
        last_cum = prev["cumulative"]

        gap_days = (today_date - last_date).days
        if gap_days <= 0:
            # 시계열이 뒤틀린 경우 방어
            skipped += 1
            continue

        delta_total = today_cum - last_cum
        if delta_total < 0:
            # 유튜브 정정/비공개 등으로 누적이 줄어든 경우: 보수적으로 0 처리
            delta_total = 0

        deltas = split_delta_evenly(delta_total, gap_days)

        running_cum = last_cum
        for i in range(gap_days):
            d = last_date + timedelta(days=i + 1)
            d_str = d.strftime("%Y-%m-%d")

            # 혹시 중간 날짜가 이미 있으면(부분 수집) 그 날짜는 건너뛰고 분배가 어긋날 수 있음
            # -> 이 경우는 드물지만, 그래도 “이미 있으면 skip”만 하고 넘어감(간단/안전)
            if (d_str, cid) in existing_keys:
                continue

            dv = deltas[i]
            running_cum += dv
            revenue = round((dv / 1000.0) * default_rpm)

            rows_to_append.append([
                d_str, cid, channel_title, dv, revenue, default_rpm, running_cum, collected_at
            ])
            added += 1

    # 날짜/채널 기준 정렬해서 append (가독성)
    rows_to_append.sort(key=lambda r: (r[0], r[1]))

    append_rows(sheets, spreadsheet_id, rows_to_append)

    print("=" * 70)
    print(f"today(KST): {today_str}")
    print(f"DEFAULT_RPM: {default_rpm}")
    print(f"ADDED: {added} rows")
    print(f"SKIPPED(today duplicates): {skipped} rows")
    print("=" * 70)


if __name__ == "__main__":
    main()
