#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
YouTube API OAuth 토큰 생성 스크립트
각 채널마다 한 번씩 실행해서 인증 토큰을 생성합니다.
"""

import os
import json
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
import pickle

# YouTube Analytics API 범위
SCOPES = ['https://www.googleapis.com/auth/yt-analytics.readonly']

def generate_token(channel_name):
    """OAuth 토큰 생성"""
    creds = None
    token_file = f'token_{channel_name}.pickle'
    
    # 기존 토큰 확인
    if os.path.exists(token_file):
        with open(token_file, 'rb') as token:
            creds = pickle.load(token)
    
    # 토큰이 없거나 유효하지 않으면 새로 생성
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            # client_secret.json 파일 필요
            flow = InstalledAppFlow.from_client_secrets_file(
                'client_secret.json', SCOPES)
            creds = flow.run_local_server(port=0)
        
        # 토큰 저장
        with open(token_file, 'wb') as token:
            pickle.dump(creds, token)
    
    # JSON 형태로 변환 (GitHub Secrets에 저장하기 위함)
    token_json = {
        'token': creds.token,
        'refresh_token': creds.refresh_token,
        'token_uri': creds.token_uri,
        'client_id': creds.client_id,
        'client_secret': creds.client_secret,
        'scopes': creds.scopes
    }
    
    # 파일로 저장
    output_file = f'credentials_{channel_name}.json'
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(token_json, f, indent=2)
    
    print(f"✅ {channel_name} 인증 완료!")
    print(f"📄 파일 생성: {output_file}")
    print(f"\n다음 내용을 GitHub Secrets에 저장하세요:")
    print(f"Secret 이름: YOUTUBE_CREDENTIALS_CHANNEL{channel_name.upper()}")
    print("-" * 50)
    print(json.dumps(token_json, indent=2))
    print("-" * 50)

if __name__ == '__main__':
    print("=" * 50)
    print("YouTube API 인증 토큰 생성")
    print("=" * 50)
    
    print("\n어느 채널을 인증하시겠습니까?")
    print("1: 엔믹스쇼츠")
    print("2: 유쾌한곰")
    
    choice = input("\n선택 (1 또는 2): ").strip()
    
    if choice == '1':
        channel_name = '1'
        print("\n엔믹스쇼츠 계정으로 로그인하세요!")
    elif choice == '2':
        channel_name = '2'
        print("\n유쾌한곰 계정으로 로그인하세요!")
    else:
        print("잘못된 선택입니다.")
        exit(1)
    
    generate_token(channel_name)
