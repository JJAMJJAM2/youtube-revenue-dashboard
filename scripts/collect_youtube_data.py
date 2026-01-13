#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
YouTube 수익 데이터 자동 수집 스크립트
- 지정한 달의 모든 데이터 수집
"""

import os
import json
from datetime import datetime, timedelta
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

# 환경 변수
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

# ==========================================
# 🎯 여기서 수집 기간을 설정하세요!
# ==========================================
COLLECTION_MODE = "custom"  # 옵션: "this_month", "last_month", "custom"

# custom 모드일 때 사용 (예: 2025년 12월 전체)
CUSTOM_START_DATE = "2025-12-01"
CUSTOM_END_DATE = "2026-01-31"
# ==========================================


def get_date_range():
    """수집 날짜 범위 계산"""
    today = datetime.now()
    
    if COLLECTION_MODE == "this_month":
        # 이번 달 1일부터 어제까지
        start_date = today.replace(day=1)
        end_date = today - timedelta(days=2)  # 2일 전까지 (YouTube 딜레이)
        
    elif COLLECTION_MODE == "last_month":
        # 지난 달 전체
        first_day_this_month = today.replace(day=1)
        last_day_last_month = first_day_this_month - timedelta(days=1)
        start_date = last_day_last_month.replace(day=1)
        end_date = last_day_last_month
        
    elif COLLECTION_MODE == "custom":
        # 사용자 지정 기간
        start_date = datetime.strptime(CUSTOM_START_DATE, '%Y-%m-%d')
        end_date = datetime.strptime(CUSTOM_END_DATE, '%Y-%m-%d')
    
    return start_date.strftime('%Y-%m-%d'), end_date.strftime('%Y-%m-%d')


def get_youtube_service(credentials_json):
    """YouTube Analytics API"""
    creds_dict = json.loads(credentials_json)
    credentials = Credentials.from_authorized_user_info(creds_dict)
    return build('youtubeAnalytics', 'v2', credentials=credentials)


def get_sheets_service(credentials_json):
    """Google Sheets API"""
    creds_dict = json.loads(credentials_json)
    credentials = Credentials.from_authorized_user_info(creds_dict)
    return build('sheets', 'v4', credentials=credentials)


def collect_channel_data(youtube, channel_name, start_date, end_date):
    """채널 데이터 수집 (전체 기간)"""
    try:
        print(f"   기간: {start_date} ~ {end_date}")
        
        response = youtube.reports().query(
            ids='channel==MINE',
            startDate=start_date,
            endDate=end_date,
            metrics='views,estimatedRevenue',
            dimensions='day',
            currency='KRW'
        ).execute()
        
        if 'rows' in response an<span class="cursor">█</span>
