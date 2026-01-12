#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
YouTube 수익 데이터 자동 수집 스크립트
- 여러 채널 지원
- RPM 자동 계산
- Google Sheets 자동 업데이트
"""

import os
import json
from datetime import datetime, timedelta
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
import gspread
from oauth2client.service_account import ServiceAccountCredentials

# 환경 변수에서 인증 정보 로드
YOUTUBE_CREDS_JSON = os.environ.get('YOUTUBE_CREDENTIALS')
SHEETS_CREDS_JSON = os.environ.get('SHEETS_CREDENTIALS')
SPREADSHEET_ID = os.environ.get('SPREADSHEET_ID')

# 채널 설정
CHANNELS = [
    {
        'name': '엔믹스쇼츠',
        'channel_id': 'MINE',  # 첫 번째 계정
        'credentials_key': 'YOUTUBE_CREDENTIALS_CHANNEL1'
    },
    {
        'name': '유쾌한곰',
        'channel_id': 'MINE',  # 두 번째 계정
        'credentials_key': 'YOUTUBE_CREDENTIALS_CHANNEL2'
    }
]


def get_yesterday_date():
    """어제 날짜 반환 (YouTube는 하루 딜레이)"""
    yesterday = datetime.now() - timedelta(days=1)
    return yesterday.strftime('%Y-%m-%d')


def get_youtube_service(credentials_json):
    """YouTube Analytics API 서비스 생성"""
    creds_dict = json.loads(credentials_json)
    credentials = Credentials.from_authorized_user_info(creds_dict)
    
    return build('youtubeAnalytics', 'v2', credentials=credentials)


def get_sheets_client():
    """Google Sheets 클라이언트 생성"""
    creds_dict = json.loads(SHEETS_CREDS_JSON)
    scope = [
        'https://spreadsheets.google.com/feeds',
        'https://www.googleapis.com/auth/drive'
    ]
    
    credentials = ServiceAccountCredentials.from_json_keyfile_dict(
        creds_dict, scope
    )
    
    return gspread.authorize(credentials)


def collect_channel_data(youtube, channel_name, date_str):
    """특정 채널의 데이터 수집"""
    try:
        response = youtube.reports().query(
            ids='channel==MINE',
            startDate=date_str,
            endDate=date_str,
            metrics='views,estimatedRevenue',
            dimensions='day',
            currency='KRW'
        ).execute()
        
        if 'rows' in response and len(response['rows']) > 0:
            row = response['rows'][0]
            date = row[0]
            views = int(row[1])
            revenue = round(float(row[2]))
            rpm = round((revenue / views * 1000), 1) if views > 0 else 0
            
            return {
                'date': date,
                'channel': channel_name,
                'views': views,
                'revenue': revenue,
                'rpm': rpm
            }
        else:
            print(f"⚠️  {channel_name}: 데이터 없음 ({date_str})")
            return None
            
    except Exception as e:
        print(f"❌ {channel_name} 오류: {str(e)}")
        return None


def is_duplicate(sheet, date, channel_name):
    """중복 데이터 체크"""
    try:
        all_records = sheet.get_all_records()
        for record in all_records:
            if record.get('날짜') == date and record.get('채널명') == channel_name:
                return True
        return False
    except:
        return False


def append_to_sheet(sheet, data):
    """Google Sheets에 데이터 추가"""
    try:
        # 중복 체크
        if is_duplicate(sheet, data['date'], data['channel']):
            print(f"⏭️  {data['channel']}: 이미 존재 ({data['date']})")
            return False
        
        # 데이터 추가
        row = [
            data['date'],
            data['channel'],
            data['views'],
            data['revenue'],
            data['rpm']
        ]
        
        sheet.append_row(row)
        print(f"✅ {data['channel']}: {data['views']:,} views, ₩{data['revenue']:,}")
        return True
        
    except Exception as e:
        print(f"❌ 시트 저장 오류: {str(e)}")
        return False


def main():
    """메인 실행 함수"""
    print("=" * 50)
    print("🎬 YouTube 수익 데이터 수집 시작")
    print("=" * 50)
    
    # 날짜
    date_str = get_yesterday_date()
    print(f"📅 수집 날짜: {date_str}")
    
    # Google Sheets 연결
    print("\n📊 Google Sheets 연결 중...")
    try:
        gc = get_sheets_client()
        spreadsheet = gc.open_by_key(SPREADSHEET_ID)
        sheet = spreadsheet.worksheet('일별데이터')
        print("✅ Google Sheets 연결 성공")
    except Exception as e:
        print(f"❌ Google Sheets 연결 실패: {str(e)}")
        return
    
    # 각 채널 데이터 수집
    print(f"\n🎥 채널 데이터 수집 중...\n")
    
    for channel_config in CHANNELS:
        channel_name = channel_config['name']
        creds_key = channel_config['credentials_key']
        
        print(f"📺 {channel_name} 처리 중...")
        
        # 채널별 인증 정보 가져오기
        channel_creds = os.environ.get(creds_key)
        
        if not channel_creds:
            print(f"⚠️  {channel_name}: 인증 정보 없음 (환경변수: {creds_key})")
            continue
        
        try:
            # YouTube API 서비스 생성
            youtube = get_youtube_service(channel_creds)
            
            # 데이터 수집
            data = collect_channel_data(youtube, channel_name, date_str)
            
            if data:
                # Google Sheets에 저장
                append_to_sheet(sheet, data)
            
        except Exception as e:
            print(f"❌ {channel_name} 처리 실패: {str(e)}")
    
    print("\n" + "=" * 50)
    print("✅ 수집 완료!")
    print("=" * 50)


if __name__ == '__main__':
    main()
