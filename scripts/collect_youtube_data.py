#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
YouTube 수익 데이터 자동 수집 스크립트 (채널관리 시트 기반 자동 매핑)
- YouTube Analytics API로 일별 조회수/수익 수집
- Google Sheets '채널관리' 시트에서 channel_id/채널명 매핑을 자동 로딩
- Google Sheets '일별데이터'에: 날짜 | channel_id | 채널명 | 조회수 | 수익(원) | RPM 형태로 저장
- 토큰 자동 갱신 포함

필수 환경변수:
- SPREADSHEET_ID
- GOOGLE_SERVICE_ACCOUNT_JSON   # ✅ Sheets 쓰기 전용(서비스 계정)
- YOUTUBE_CREDENTIALS_CHANNEL1, YOUTUBE_CREDENTIALS_CHANNEL2, ... (채널 수만큼)

필수 시트:
- 채널관리: channel_id | 채널명 | 주제(니치) | 수창 상태 | 계정 이메일 | 원본 소스 | 전략 | 담당자 | 메모
- 일별데이터: 날짜 | channel_id | 채널명 | 조회수 | 수익(원) | RPM
"""

import os
import json
from datetime import datetime, timedelta

from google.oauth2.credentials import Credentials
from google.oauth2 import service_account
from google.auth.transport.requests import Request
from googleapiclient.discovery import build

SPREADSHEET_ID = os.environ.get('SPREADSHEET_ID')

# ===== 시트명 =====
SHEET_MANAGE = '채널관리'
SHEET_DAILY = '일별데이터'

# ===== 채널 계정별 OAuth 자격증명(Secrets) 키 목록 =====
CHANNEL_CREDENTIAL_KEYS = [
    'YOUTUBE_CREDENTIALS_CHANNEL1',
    'YOUTUBE_CREDENTIALS_CHANNEL2',
    'YOUTUBE_CREDENTIALS_CHANNEL3',
    'YOUTUBE_CREDENTIALS_CHANNEL4',
    # 'YOUTUBE_CREDENTIALS_CHANNEL5',
]

# ===== 수집 기간 설정 =====
COLLECTION_MODE = "custom"  # "this_month", "last_month", "custom"
CUSTOM_START_DATE = "2025-12-01"
CUSTOM_END_DATE = "2026-01-31"


def get_date_range():
    """날짜 범위 계산"""
    today = datetime.now()

    if COLLECTION_MODE == "this_month":
        start_date = today.replace(day=1)
        end_date = today - timedelta(days=2)

    elif COLLECTION_MODE == "last_month":
        first_day_this_month = today.replace(day=1)
        last_day_last_month = first_day_this_month - timedelta(days=1)
        start_date = last_day_last_month.replace(day=1)
        end_date = last_day_last_month

    elif COLLECTION_MODE == "custom":
        start_date = datetime.strptime(CUSTOM_START_DATE, '%Y-%m-%d')
        end_date = datetime.strptime(CUSTOM_END_DATE, '%Y-%m-%d')

    return start_date.strftime('%Y-%m-%d'), end_date.strftime('%Y-%m-%d')


def build_oauth_credentials(credentials_json, label=""):
    """OAuth Credentials 생성 + 자동 갱신 (YouTube 채널 토큰용)"""
    creds_dict = json.loads(credentials_json)
    credentials = Credentials.from_authorized_user_info(creds_dict)

    if not credentials.valid:
        if credentials.expired and credentials.refresh_token:
            print(f"   Refreshing token {label}...")
            credentials.refresh(Request())
            print(f"   Token refreshed {label}!")
        else:
            raise ValueError(f"Invalid credentials {label} (cannot refresh)")

    return credentials


def get_youtube_service(credentials_json):
    """YouTube Analytics API client"""
    credentials = build_oauth_credentials(credentials_json, label="(YouTube)")
    return build('youtubeAnalytics', 'v2', credentials=credentials)


def get_sheets_service_service_account(service_account_json):
    """Sheets API client (Service Account)"""
    info = json.loads(service_account_json)
    scopes = ['https://www.googleapis.com/auth/spreadsheets']
    credentials = service_account.Credentials.from_service_account_info(info, scopes=scopes)
    return build('sheets', 'v4', credentials=credentials)


def load_channel_manage_map(sheets_service):
    """
    채널관리 시트에서 channel_id <-> 채널명 매핑 로드
    반환:
      - id_to_name: {channel_id: 채널명}
      - name_to_id: {채널명: channel_id}
    """
    print("Loading channel map from '채널관리' sheet...")

    res = sheets_service.spreadsheets().values().get(
        spreadsheetId=SPREADSHEET_ID,
        range=f'{SHEET_MANAGE}!A:I'
    ).execute()

    values = res.get('values', [])
    if len(values) <= 1:
        raise RuntimeError("채널관리 시트에 데이터가 없습니다. (헤더 아래 행 필요)")

    rows = values[1:]
    id_to_name = {}
    name_to_id = {}

    for r in rows:
        channel_id = (r[0] if len(r) > 0 else "").strip()
        channel_name = (r[1] if len(r) > 1 else "").strip()

        if not channel_id or not channel_name:
            continue

        id_to_name[channel_id] = channel_name
        name_to_id[channel_name] = channel_id

    if not id_to_name:
        raise RuntimeError("채널관리 시트에서 유효한 channel_id/채널명을 찾지 못했습니다.")

    print(f"OK: loaded {len(id_to_name)} channels from 채널관리\n")
    return id_to_name, name_to_id


def get_existing_keys(sheets_service):
    """
    일별데이터 기존 데이터 키 로드
    키: (date, channel_id)
    범위: A:B (날짜, channel_id)
    """
    print("Checking existing data keys (date, channel_id)...")
    try:
        res = sheets_service.spreadsheets().values().get(
            spreadsheetId=SPREADSHEET_ID,
            range=f'{SHEET_DAILY}!A:B'
        ).execute()

        values = res.get('values', [])
        existing = set()

        for row in values[1:]:
            if len(row) >= 2:
                date = row[0]
                cid = row[1]
                if date and cid:
                    existing.add((date, cid))

        print(f"Existing keys: {len(existing)}\n")
        return existing

    except Exception as e:
        print(f"WARNING: failed to read existing keys: {e}\n")
        return set()


def collect_channel_data(youtube, channel_id, channel_name, start_date, end_date):
    """채널 데이터 수집 (일별)"""
    print(f"   Period: {start_date} ~ {end_date}")

    response = youtube.reports().query(
        ids='channel==MINE',
        startDate=start_date,
        endDate=end_date,
        metrics='views,estimatedRevenue',
        dimensions='day',
        currency='KRW'
    ).execute()

    rows = response.get('rows', [])
    if not rows:
        print("   WARNING: No data available")
        return []

    results = []
    for row in rows:
        date = row[0]
        views = int(row[1])
        revenue = round(float(row[2]))
        rpm = round((revenue / views * 1000), 1) if views > 0 else 0

        results.append({
            'date': date,
            'channel_id': channel_id,
            'channel': channel_name,
            'views': views,
            'revenue': revenue,
            'rpm': rpm
        })

    print(f"   OK: {len(results)} days collected")
    return results


def append_rows(sheets_service, rows):
    """일별데이터에 행 추가 (A:F)"""
    if not rows:
        return

    body = {'values': rows}
    sheets_service.spreadsheets().values().append(
        spreadsheetId=SPREADSHEET_ID,
        range=f'{SHEET_DAILY}!A:F',
        valueInputOption='RAW',
        body=body
    ).execute()


def main():
    print("=" * 70)
    print("YouTube Revenue Data Collection (Channel Map from Sheets)")
    print("=" * 70)

    if not SPREADSHEET_ID:
        print("ERROR: SPREADSHEET_ID not set")
        return

    start_date, end_date = get_date_range()
    print(f"Period: {start_date} ~ {end_date}")
    print(f"Mode: {COLLECTION_MODE}\n")

    # ✅ Sheets는 서비스 계정으로 연결(채널 토큰 revoke 영향 제거)
    sa_json = os.environ.get('GOOGLE_SERVICE_ACCOUNT_JSON')
    if not sa_json:
        print("ERROR: GOOGLE_SERVICE_ACCOUNT_JSON not found")
        print("Hint: GitHub Secrets에 GOOGLE_SERVICE_ACCOUNT_JSON 추가하세요. (Vercel과 동일 서비스 계정 JSON 가능)")
        return

    print("Connecting to Google Sheets (Service Account)...")
    try:
        sheets_service = get_sheets_service_service_account(sa_json)
        print("OK: Sheets connected (Service Account)\n")
    except Exception as e:
        print(f"ERROR: Sheets connection failed - {e}")
        return

    # 채널관리에서 채널 매핑 로드
    try:
        id_to_name, _ = load_channel_manage_map(sheets_service)
    except Exception as e:
        print(f"ERROR: failed to load 채널관리 map - {e}")
        return

    # 기존 키(중복 방지)
    existing_keys = get_existing_keys(sheets_service)

    print("Collecting channel data...\n")
    total_added = 0

    for creds_key in CHANNEL_CREDENTIAL_KEYS:
        channel_creds = os.environ.get(creds_key)
        if not channel_creds:
            print(f"Channel cred missing: {creds_key} (skip)\n")
            continue

        # 순서 기반 매핑: creds_key 인덱스 => 채널관리의 channel_id 목록 순서
        idx = CHANNEL_CREDENTIAL_KEYS.index(creds_key)
        channel_ids = list(id_to_name.keys())

        if idx >= len(channel_ids):
            print(f"Channel map 부족: creds({creds_key})는 있는데 채널관리 channel_id 행이 더 필요합니다.\n")
            continue

        channel_id = channel_ids[idx]
        channel_name = id_to_name[channel_id]

        print(f"Channel: {channel_name} ({channel_id})")

        try:
            youtube = get_youtube_service(channel_creds)
            data_list = collect_channel_data(youtube, channel_id, channel_name, start_date, end_date)

            rows_to_append = []
            skipped = 0

            for d in data_list:
                k = (d['date'], d['channel_id'])
                if k in existing_keys:
                    skipped += 1
                    continue

                rows_to_append.append([
                    d['date'],
                    d['channel_id'],
                    d['channel'],
                    d['views'],
                    d['revenue'],
                    d['rpm']
                ])

            if rows_to_append:
                append_rows(sheets_service, rows_to_append)
                for r in rows_to_append:
                    existing_keys.add((r[0], r[1]))
                total_added += len(rows_to_append)
                print(f"   ADDED: {len(rows_to_append)} rows")

            if skipped:
                print(f"   SKIPPED: {skipped} duplicates")

            print()

        except Exception as e:
            print(f"   ERROR: {e}\n")

    print("=" * 70)
    print(f"DONE! Total added: {total_added} rows")
    print("=" * 70)


if __name__ == '__main__':
    main()
