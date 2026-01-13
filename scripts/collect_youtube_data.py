#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
YouTube 수익 데이터 자동 수집 스크립트
- 자동 토큰 갱신 기능 포함
"""

import os
import json
from datetime import datetime, timedelta
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build

SPREADSHEET_ID = os.environ.get('SPREADSHEET_ID')

CHANNELS = [
    {
        'name': '엔믹스쇼츠',
        'credentials_key': 'YOUTUBE_CREDENTIALS_CHANNEL1'
    },
    {
        'name': '유쾌한곰',
        'credentials_key': 'YOUTUBE_CREDENTIALS_CHANNEL2'
    }
]

# 수집 기간 설정
COLLECTION_MODE = "last_month"  # "this_month", "last_month", "custom"

# custom 모드일 때
CUSTOM_START_DATE = "2025-12-01"
CUSTOM_END_DATE = "2025-12-31"


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


def get_youtube_service(credentials_json):
    """YouTube API with auto token refresh"""
    creds_dict = json.loads(credentials_json)
    credentials = Credentials.from_authorized_user_info(creds_dict)
    
    # 토큰 만료 확인 및 자동 갱신
    if not credentials.valid:
        if credentials.expired and credentials.refresh_token:
            print("   Token expired, refreshing...")
            try:
                credentials.refresh(Request())
                print("   Token refreshed successfully!")
            except Exception as e:
                print(f"   Token refresh failed: {e}")
                raise
        else:
            print("   Token invalid and cannot be refreshed!")
            raise ValueError("Invalid credentials")
    
    return build('youtubeAnalytics', 'v2', credentials=credentials)


def get_sheets_service(credentials_json):
    """Sheets API with auto token refresh"""
    creds_dict = json.loads(credentials_json)
    credentials = Credentials.from_authorized_user_info(creds_dict)
    
    # 토큰 만료 확인 및 자동 갱신
    if not credentials.valid:
        if credentials.expired and credentials.refresh_token:
            print("   Refreshing Sheets token...")
            try:
                credentials.refresh(Request())
                print("   Sheets token refreshed!")
            except Exception as e:
                print(f"   Sheets token refresh failed: {e}")
                raise
    
    return build('sheets', 'v4', credentials=credentials)


def collect_channel_data(youtube, channel_name, start_date, end_date):
    """채널 데이터 수집"""
    try:
        print(f"   Period: {start_date} ~ {end_date}")
        
        response = youtube.reports().query(
            ids='channel==MINE',
            startDate=start_date,
            endDate=end_date,
            metrics='views,estimatedRevenue',
            dimensions='day',
            currency='KRW'
        ).execute()
        
        if 'rows' in response and len(response['rows']) > 0:
            results = []
            
            for row in response['rows']:
                date = row[0]
                views = int(row[1])
                revenue = round(float(row[2]))
                rpm = round((revenue / views * 1000), 1) if views > 0 else 0
                
                results.append({
                    'date': date,
                    'channel': channel_name,
                    'views': views,
                    'revenue': revenue,
                    'rpm': rpm
                })
            
            print(f"   OK: {len(results)} days collected")
            return results
        else:
            print(f"   WARNING: No data available")
            return []
            
    except Exception as e:
        print(f"   ERROR: {str(e)}")
        return []


def get_existing_data(sheets_service):
    """기존 데이터 확인"""
    try:
        result = sheets_service.spreadsheets().values().get(
            spreadsheetId=SPREADSHEET_ID,
            range='일별데이터!A:B'
        ).execute()
        
        values = result.get('values', [])
        existing = set()
        
        for row in values[1:]:
            if len(row) >= 2:
                existing.add((row[0], row[1]))
        
        return existing
    except Exception as e:
        print(f"   Error checking existing data: {e}")
        return set()


def append_to_sheet(sheets_service, data_list, existing_data):
    """시트에 추가"""
    try:
        new_data = []
        skip_count = 0
        
        for data in data_list:
            key = (data['date'], data['channel'])
            
            if key in existing_data:
                skip_count += 1
                continue
            
            new_data.append([
                data['date'],
                data['channel'],
                data['views'],
                data['revenue'],
                data['rpm']
            ])
        
        if new_data:
            body = {'values': new_data}
            
            sheets_service.spreadsheets().values().append(
                spreadsheetId=SPREADSHEET_ID,
                range='일별데이터!A:E',
                valueInputOption='RAW',
                body=body
            ).execute()
            
            print(f"   ADDED: {len(new_data)} rows")
        
        if skip_count > 0:
            print(f"   SKIPPED: {skip_count} duplicates")
        
        return len(new_data)
        
    except Exception as e:
        print(f"   ERROR saving to sheet: {str(e)}")
        return 0


def main():
    """메인"""
    print("=" * 60)
    print("YouTube Revenue Data Collection (Auto Token Refresh)")
    print("=" * 60)
    
    start_date, end_date = get_date_range()
    print(f"Period: {start_date} ~ {end_date}")
    print(f"Mode: {COLLECTION_MODE}\n")
    
    print("Connecting to Google Sheets...")
    
    sheets_creds = os.environ.get('YOUTUBE_CREDENTIALS_CHANNEL1')
    
    if not sheets_creds:
        print("ERROR: YOUTUBE_CREDENTIALS_CHANNEL1 not found")
        return
    
    try:
        sheets_service = get_sheets_service(sheets_creds)
        print("OK: Sheets connected\n")
    except Exception as e:
        print(f"ERROR: Sheets connection failed - {str(e)}")
        return
    
    print("Checking existing data...")
    existing_data = get_existing_data(sheets_service)
    print(f"Existing: {len(existing_data)} rows\n")
    
    print("Collecting channel data...\n")
    
    total_added = 0
    
    for channel_config in CHANNELS:
        channel_name = channel_config['name']
        creds_key = channel_config['credentials_key']
        
        print(f"Channel: {channel_name}")
        
        channel_creds = os.environ.get(creds_key)
        
        if not channel_creds:
            print(f"   WARNING: No credentials ({creds_key})\n")
            continue
        
        try:
            youtube = get_youtube_service(channel_creds)
            data_list = collect_channel_data(youtube, channel_name, start_date, end_date)
            
            if data_list:
                added = append_to_sheet(sheets_service, data_list, existing_data)
                total_added += added
                
                for data in data_list:
                    existing_data.add((data['date'], data['channel']))
            
            print()
            
        except Exception as e:
            print(f"   ERROR: {str(e)}\n")
    
    print("=" * 60)
    print(f"DONE! Total added: {total_added} rows")
    print("=" * 60)


if __name__ == '__main__':
    main()
