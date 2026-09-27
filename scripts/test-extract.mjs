// 네이버 접속 없이 추출 로직만 검증한다.
// 실제 검색 결과와 비슷한 구조의 목업 HTML 을 만들어 extractArticles 를 돌린다.
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('./crawl.mjs', import.meta.url), 'utf8');
const fnText = source.slice(
  source.indexOf('function extractArticles()'),
  source.indexOf('async function collect')
);

const MOCK = `<!doctype html><html lang="ko"><body>
<div id="header"><a href="https://search.naver.com/x">검색</a></div>
<ul class="list_news">
  <li class="bx">
    <div class="news_wrap">
      <a href="https://n.news.naver.com/article/025/0003552567" class="news_tit">아이폰 듀오 공개 뒤 갤럭시 Z 폴드8 국내 판매 10% 증가</a>
      <div class="info_group">
        <a href="https://media.naver.com/press/025" class="press">중앙일보</a>
        <span class="info">2시간 전</span>
      </div>
      <div class="dsc_wrap">애플이 첫 폴더블폰을 공개한 이후 국내에서는 오히려 삼성전자 갤럭시 Z 폴드8 판매량이 늘어난 것으로 나타났다.</div>
    </div>
  </li>
  <li class="bx">
    <div class="news_wrap">
      <a href="https://zdnet.co.kr/view/?no=20260921080251" class="news_tit">갤럭시S27 울트라 배터리 용량 커진다 5700mAh 전망</a>
      <div class="info_group">
        <a href="https://media.naver.com/press/092" class="press">지디넷코리아</a>
        <span class="info">32분 전</span>
      </div>
      <div class="dsc_wrap">갤럭시S27 울트라와 프로가 중국 3C 인증을 획득했다. 정격 용량은 5534mAh로 표기됐다.</div>
    </div>
  </li>
  <li class="bx">
    <div class="news_wrap">
      <a href="https://n.news.naver.com/article/003/0014202562" class="news_tit">아이폰18 프로 패닉풀 재부팅 제보 잇따라</a>
      <div class="info_group">
        <a href="https://media.naver.com/press/003" class="press">뉴시스</a>
        <span class="info">1일 전</span>
      </div>
      <div class="dsc_wrap">페이스ID 인증이나 애플페이 이용 중 기기가 꺼졌다 켜진다는 사례가 국내외에서 이어지고 있다.</div>
    </div>
  </li>
</ul>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(MOCK, { waitUntil: 'domcontentloaded' });
const articles = await page.evaluate(`(() => { ${fnText} return extractArticles(); })()`);
await browser.close();

console.log(`추출된 기사 수: ${articles.length}`);
for (const a of articles) {
  console.log('---');
  console.log('제목:', a.title);
  console.log('언론사:', a.press);
  console.log('시간:', a.relativeTime);
  console.log('링크:', a.link);
  console.log('미리보기:', a.summary.slice(0, 60));
}

const ok =
  articles.length === 3 &&
  articles.every((a) => a.title && a.link.startsWith('http') && a.press && a.relativeTime);
console.log(ok ? '\nPASS: 제목/링크/언론사/시간 모두 추출됨' : '\nFAIL: 누락 항목 있음');
process.exitCode = ok ? 0 : 1;
