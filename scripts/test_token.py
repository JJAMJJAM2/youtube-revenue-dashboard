import json
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

# credentials_1.json 읽기
with open('credentials_1.json', 'r') as f:
    creds_dict = json.load(f)

credentials = Credentials.from_authorized_user_info(creds_dict)

print(f"Token valid: {credentials.valid}")
print(f"Token expired: {credentials.expired}")

if credentials.expired:
    print("토큰이 만료되었습니다! 재생성 필요!")
else:
    print("토큰이 유효합니다.")
    
    # YouTube API 테스트
    youtube = build('youtubeAnalytics', 'v2', credentials=credentials)
    
    response = youtube.reports().query(
        ids='channel==MINE',
        startDate='2025-12-01',
        endDate='2025-12-31',
        metrics='views,estimatedRevenue',
        currency='KRW'
    ).execute()
    
    print("\n데이터 수집 성공!")
    print(json.dumps(response, indent=2, ensure_ascii=False))
