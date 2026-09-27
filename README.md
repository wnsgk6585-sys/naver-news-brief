# 네이버 뉴스 브리핑 크롤러

매일 아침 네이버 뉴스에서 "삼성 갤럭시"와 "애플" 기사를 Playwright로 수집해
`data/latest.json` 에 저장한다. Claude 예약 작업이 이 파일을 읽어 요약한 뒤
카카오톡 나와의 채팅으로 보낸다.

## 구조

- `scripts/crawl.mjs` — 수집 스크립트
- `scripts/test-extract.mjs` — 네이버 접속 없이 추출 로직만 검증하는 테스트
- `.github/workflows/daily-news.yml` — 매일 07:30(KST) 실행, 결과 커밋
- `data/latest.json` — 수집 결과 (워크플로가 덮어씀)

## 설정

1. 이 저장소를 GitHub에 올린다 (공개/비공개 모두 가능).
2. Settings → Actions → General → Workflow permissions 에서
   **Read and write permissions** 를 선택한다. (결과 커밋에 필요)
3. Actions 탭 → `daily-news-crawl` → **Run workflow** 로 수동 실행해 테스트한다.

## 결과 파일 주소

```
https://raw.githubusercontent.com/<계정>/<저장소>/main/data/latest.json
```

비공개 저장소면 이 주소로 바로 읽을 수 없다. 공개 저장소로 두거나,
토큰을 쓰는 방식으로 바꿔야 한다.

## 결과 형식

```json
{
  "collectedAtKst": "2026-09-28 07:31:02 KST",
  "dateKst": "2026-09-28",
  "weekdayKst": "월",
  "totalCount": 52,
  "groups": [
    {
      "brand": "samsung",
      "label": "삼성 갤럭시",
      "count": 26,
      "articles": [
        {
          "title": "기사 제목",
          "link": "https://n.news.naver.com/article/...",
          "press": "언론사",
          "relativeTime": "2시간 전",
          "summary": "본문 미리보기"
        }
      ]
    }
  ]
}
```

## 고장났을 때

- Actions 실행은 됐는데 `totalCount` 가 0이면 네이버가 화면 구조를 바꿨거나
  자동화로 판단해 차단한 것이다. 실행 로그의 `debug` 아티팩트(HTML·스크린샷)를
  내려받아 확인한다.
- 저장소에 60일간 사람 활동이 없으면 GitHub이 예약 실행을 자동으로 끈다.
  가끔 커밋하거나 Actions 탭에서 다시 켠다.
