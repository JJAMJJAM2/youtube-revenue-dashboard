#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
YouTube API OAuth 토큰 생성 스크립트 (채널 추가 확장 버전)
- 채널 번호(1~99 등)를 입력받아 해당 번호로 token/credentials 파일 생성
- GitHub Secrets에 넣을 JSON을 출력

필요 파일:
- client_secret.json (repo 루트에 위치)

생성 파일:
- token_{N}.pickle
- credentials_{N}.json

GitHub Secrets 이름:
- YOUTUBE_CREDENTIALS_CHANNEL{N}
"""

import os
import json
import pickle
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request

# ✅ 권장 스코프 (수익 데이터 + Sheets 쓰기)
SCOPES = [
    "https://www.googleapis.com/auth/yt-analytics-monetary.readonly",
    "https://www.googleapis.com/auth/spreadsheets"
]

CLIENT_SECRET_FILE = "client_secret.json"


def generate_token(channel_no: str):
    """OAuth 토큰 생성"""
    creds = None
    token_file = f"token_{channel_no}.pickle"

    # 기존 토큰 확인
    if os.path.exists(token_file):
        with open(token_file, "rb") as token:
            creds = pickle.load(token)

    # 토큰이 없거나 유효하지 않으면 새로 생성
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            print("기존 토큰이 만료되어 refresh 합니다...")
            creds.refresh(Request())
            print("refresh 완료!")
        else:
            if not os.path.exists(CLIENT_SECRET_FILE):
                raise FileNotFoundError(
                    f"'{CLIENT_SECRET_FILE}' 파일이 없습니다. repo 루트에 두고 다시 실행하세요."
                )

            flow = InstalledAppFlow.from_client_secrets_file(
                CLIENT_SECRET_FILE, SCOPES
            )
            print("\n브라우저가 열리면, 해당 채널 계정으로 로그인 후 '허용'을 눌러주세요.")
            creds = flow.run_local_server(port=0)

        # 토큰 저장
        with open(token_file, "wb") as token:
            pickle.dump(creds, token)

    # JSON 형태로 변환 (GitHub Secrets에 저장하기 위함)
    token_json = {
        "token": creds.token,
        "refresh_token": creds.refresh_token,
        "token_uri": creds.token_uri,
        "client_id": creds.client_id,
        "client_secret": creds.client_secret,
        "scopes": list(creds.scopes) if creds.scopes else SCOPES
    }

    # 파일로 저장
    output_file = f"credentials_{channel_no}.json"
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(token_json, f, indent=2, ensure_ascii=False)

    secret_name = f"YOUTUBE_CREDENTIALS_CHANNEL{channel_no}"

    print(f"\n✅ 채널 {channel_no} 인증 완료!")
    print(f"📄 파일 생성: {output_file}")
    print("\n아래 JSON 전체를 GitHub Secrets에 저장하세요.")
    print(f"Secret 이름: {secret_name}")
    print("-" * 60)
    print(json.dumps(token_json, indent=2, ensure_ascii=False))
    print("-" * 60)


def main():
    print("=" * 60)
    print("YouTube API 인증 토큰 생성 (확장 버전)")
    print("=" * 60)
    print("\n채널 번호를 입력하세요.")
    print("- 예: 1(엔믹스쇼츠), 2(유쾌한곰), 3(새 채널)...")
    print("- 3~5번 채널도 같은 방식으로 생성해서 Secrets에 추가하면 됩니다.\n")

    channel_no = input("채널 번호 입력 (예: 3): ").strip()

    if not channel_no.isdigit():
        print("❌ 숫자만 입력해주세요.")
        return

    generate_token(channel_no)


if __name__ == "__main__":
    main()
