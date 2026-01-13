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
from google.oauth2.service_account import ServiceAccountCredentials

# 환경 변수에서 인증 정보 로드
SPREADSHEET_ID = os.environ.get('SPREADSHEET_ID')

# 채널 설정
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


def get_yesterday_date():
    """어제 날짜 반환 (YouTube는 하루 딜레이)"""
    yesterday = datetime.now() - timedelta(days=1)
    return yesterday.strftime('%Y-%m-%d')


def get_youtube_service(credentials_json):
    """YouTube Analytics API 서비스 생성"""
    creds_dict = json.loads(credentials_json)
    credentials = Credentials.from_authorized_user_info(creds_dict)
    
    return build('youtubeAnalytics', 'v2', credentials=credentials)


def get_sheets_service(credentials_json):
    """Google Sheets API 서비스 생성"""
    creds_dict = json.loads(credentials_json)
    credentials = Credentials.from_authorized_user_info(creds_dict)
    
    return build('sheets', 'v4', credentials=credentials)


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


def check_duplicate(sheets_service, date, channel_name):
    """중복 데이터 체크"""
    try:
        result = sheets_service.spreadsheets().values().get(
            spreadsheetId=SPREADSHEET_ID,
            range='일별데이터!A:B'
        ).execute()
        
        values = result.get('values', [])
        
        for row in values[1:]:  # 헤더 제외
            if len(row) >= 2 and row[0] == date and row[1] == channel_name:
                return True
        return False
    except:
        return False


def append_to_sheet(sheets_service, data):
    """Google Sheets에 데이터 추가"""
    try:
        # 중복 체크
        if check_duplicate(sheets_service, data['date'], data['channel']):
            print(f"⏭️  {data['channel']}: 이미 존재 ({data['date']})")
            return False
        
        # 데이터 추가
        values = [[
            data['date'],
            data['channel'],
            data['views'],
            data['revenue'],
            data['rpm']
        ]]
        
        body = {'values': values}
        
        sheets_service.spreadsheets().values().append(
            spreadsheetId=SPREADSHEET_ID,
            range='일별데이터!A:E',
            valueInputOption='RAW',
            body=body
        ).execute()
        
        print(f"✅ {data['channel']}: {data['views']:,} views, ₩{data['revenue']:,}, RPM: ₩{data['rpm']}")
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
    
    # Google Sheets 서비스 생성 (채널1 인증으로 공용 사용)
    print("\n📊 Google Sheets 연결 중...")
    try:
        sheets_creds = os.environ.get('YOUTUBE_CREDENTIALS_CHANNEL1')
        sheets_service = get_sheets_service(sheets_creds)
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
                append_to_sheet(sheets_service, data)
            
        except Exception as e:
            print(f"❌ {channel_name} 처리 실패: {str(e)}")
    
    print("\n" + "=" * 50)
    print("✅ 수집 완료!")
    print("=" * 50)


if __name__ == '__main__':
    main()
