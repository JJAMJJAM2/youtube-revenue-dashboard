#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os
import json
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build

SPREADSHEET_ID = os.environ.get('SPREADSHEET_ID')

SHEET_MANAGE = '채널관리'
SHEET_DAILY = '일별데이터'

def build_credentials(credentials_json):
    creds_dict = json.loads(credentials_json)
    credentials = Credentials.from_authorized_user_info(creds_dict)

    if not credentials.valid:
        if credentials.expired and credentials.refresh_token:
            credentials.refresh(Request())
        else:
            raise ValueError("Invalid credentials (cannot refresh)")
    return credentials

def get_sheets_service(credentials_json):
    credentials = build_credentials(credentials_json)
    return build('sheets', 'v4', credentials=credentials)

def load_name_to_id(sheets_service):
    res = sheets_service.spreadsheets().values().get(
        spreadsheetId=SPREADSHEET_ID,
        range=f'{SHEET_MANAGE}!A:B'
    ).execute()

    values = res.get('values', [])
    if len(values) <= 1:
        raise RuntimeError("채널관리 시트가 비어있습니다.")

    rows = values[1:]
    name_to_id = {}

    for r in rows:
        cid = (r[0] if len(r) > 0 else "").strip()
        name = (r[1] if len(r) > 1 else "").strip()
        if cid and name:
            name_to_id[name] = cid

    if not name_to_id:
        raise RuntimeError("채널관리에서 채널명/ID 매핑을 찾지 못했습니다.")

    return name_to_id

def backfill(sheets_service):
    # 일별데이터: A 날짜 | B channel_id | C 채널명 | D 조회수 | E 수익 | F RPM
    res = sheets_service.spreadsheets().values().get(
        spreadsheetId=SPREADSHEET_ID,
        range=f'{SHEET_DAILY}!A:F'
    ).execute()

    values = res.get('values', [])
    if len(values) <= 1:
        print("일별데이터에 데이터가 없습니다.")
        return

    name_to_id = load_name_to_id(sheets_service)

    updates = []
    for i, row in enumerate(values[1:], start=2):  # sheet row index
        date = row[0] if len(row) > 0 else ""
        channel_id = row[1] if len(row) > 1 else ""
        channel_name = row[2] if len(row) > 2 else ""

        if not date:
            continue

        if channel_id:  # 이미 채워짐
            continue

        if not channel_name:
            continue

        cid = name_to_id.get(channel_name)
        if not cid:
            continue

        # B열 업데이트 (예: B2)
        updates.append({
            "range": f"{SHEET_DAILY}!B{i}",
            "values": [[cid]]
        })

    if not updates:
        print("백필할 대상이 없습니다. (channel_id가 이미 모두 채워져있음)")
        return

    body = {"valueInputOption": "RAW", "data": updates}
    sheets_service.spreadsheets().values().batchUpdate(
        spreadsheetId=SPREADSHEET_ID,
        body=body
    ).execute()

    print(f"DONE: backfilled channel_id for {len(updates)} rows")

def main():
    if not SPREADSHEET_ID:
        print("ERROR: SPREADSHEET_ID not set")
        return

    sheets_creds_json = os.environ.get('YOUTUBE_CREDENTIALS_CHANNEL1')
    if not sheets_creds_json:
        print("ERROR: YOUTUBE_CREDENTIALS_CHANNEL1 not found")
        return

    sheets_service = get_sheets_service(sheets_creds_json)
    backfill(sheets_service)

if __name__ == '__main__':
    main()
