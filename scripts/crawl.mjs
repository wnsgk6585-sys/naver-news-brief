// 네이버 뉴스 검색 결과를 Playwright로 수집해 data/latest.json 으로 저장한다.
// 수집 대상 검색어는 QUERIES 에 정의한다.
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const QUERIES = [
  { brand: 'samsung', label: '삼성 갤럭시', query: '삼성 갤럭시' },
  { brand: 'apple', label: '애플', query: '애플' },
];

// 최근 1일, 최신순 정렬
const buildUrl = (query) =>
  'https://search.naver.com/search.naver?ssc=tab.news.all&where=news' +
  `&query=${encodeURIComponent(query)}` +
  '&sort=1&nso=' + encodeURIComponent('so:dd,p:1d');

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

// 페이지 안에서 기사 목록을 긁는다. 네이버가 DOM 을 자주 바꾸므로
// 특정 클래스에 의존하지 않고 "네이버 뉴스/언론사 기사 링크를 가진 블록" 을 찾는 방식으로 처리한다.
function extractArticles() {
  const isArticleHref = (href) =>
    !!href &&
    /^https?:\/\//.test(href) &&
    !/search\.naver\.com|help\.naver\.com|nid\.naver\.com|policy\.naver\.com/.test(href);

  const seen = new Set();
  const out = [];

  // 기사 카드 후보: 링크를 포함한 li / div 블록
  const blocks = Array.from(document.querySelectorAll('li, div')).filter((el) => {
    const links = el.querySelectorAll('a[href]');
    if (links.length === 0) return false;
    // 너무 큰 컨테이너 제외
    return el.innerText && el.innerText.length > 30 && el.innerText.length < 1200;
  });

  for (const block of blocks) {
    const anchors = Array.from(block.querySelectorAll('a[href]'));

    // 제목 후보: 텍스트가 충분히 길고 기사 링크를 가진 앵커
    const titleAnchor = anchors.find((a) => {
      const text = (a.innerText || '').trim();
      return text.length >= 12 && text.length <= 120 && isArticleHref(a.href);
    });
    if (!titleAnchor) continue;

    const title = titleAnchor.innerText.trim().replace(/\s+/g, ' ');
    if (seen.has(title)) continue;

    // 같은 기사의 네이버뉴스 링크가 있으면 그것을 우선 사용
    const naverAnchor = anchors.find((a) => /n\.news\.naver\.com/.test(a.href));
    const link = naverAnchor ? naverAnchor.href : titleAnchor.href;

    const blockText = (block.innerText || '').replace(/\s+/g, ' ').trim();

    // 상대 시간 표기 (예: 32분 전, 3시간 전, 1일 전)
    const timeMatch = blockText.match(/(\d+)\s*(분|시간|일)\s*전/);
    const relativeTime = timeMatch ? timeMatch[0] : '';

    // 언론사명: 제목 앵커를 제외한 짧은 텍스트 앵커 중 첫 번째
    const pressAnchor = anchors.find((a) => {
      const text = (a.innerText || '').trim();
      return a !== titleAnchor && text.length > 1 && text.length <= 20 && !/^\d/.test(text);
    });
    const press = pressAnchor ? pressAnchor.innerText.trim() : '';

    // 본문 미리보기: 제목을 제외한 나머지 텍스트에서 긴 문장
    let summary = blockText.replace(title, ' ').trim();
    if (press) summary = summary.replace(press, ' ').trim();
    summary = summary.replace(/\d+\s*(분|시간|일)\s*전/g, ' ').replace(/\s+/g, ' ').trim();
    if (summary.length > 220) summary = summary.slice(0, 220) + '…';

    seen.add(title);
    out.push({ title, link, press, relativeTime, summary });
  }

  return out;
}

async function collect(page, item) {
  const url = buildUrl(item.query);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  // 목록이 늦게 붙는 경우가 있어 잠시 대기 후 스크롤로 추가 로딩
  await page.waitForTimeout(2500);
  for (let i = 0; i < 3; i += 1) {
    await page.mouse.wheel(0, 3000);
    await page.waitForTimeout(1200);
  }

  const articles = await page.evaluate(extractArticles);
  const html = await page.content();

  // 한 건도 못 가져오면 원인 파악용으로 화면과 HTML 을 남긴다 (Actions 에서 다운로드 가능)
  if (articles.length === 0) {
    await mkdir('debug', { recursive: true });
    await writeFile(path.join('debug', `${item.brand}.html`), html, 'utf8');
    await page.screenshot({ path: path.join('debug', `${item.brand}.png`), fullPage: false });
  }

  return {
    ...item,
    url,
    count: articles.length,
    articles: articles.slice(0, 40),
    htmlLength: html.length,
    blocked: /비정상적인 검색|자동입력 방지|캡차|접근이 일시적으로 제한/.test(html),
  };
}

async function main() {
  const outDir = path.resolve('data');
  await mkdir(outDir, { recursive: true });

  const browser = await chromium.launch({ args: ['--disable-blink-features=AutomationControlled'] });
  const context = await browser.newContext({
    userAgent: UA,
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
    viewport: { width: 1280, height: 900 },
    extraHTTPHeaders: { 'Accept-Language': 'ko-KR,ko;q=0.9' },
  });
  const page = await context.newPage();

  const results = [];
  for (const item of QUERIES) {
    try {
      const result = await collect(page, item);
      results.push(result);
      console.log(`[ok] ${item.label}: ${result.count}건${result.blocked ? ' (차단 의심)' : ''}`);
    } catch (error) {
      results.push({ ...item, url: buildUrl(item.query), count: 0, articles: [], error: String(error) });
      console.log(`[fail] ${item.label}: ${error}`);
    }
  }

  await browser.close();

  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const payload = {
    collectedAtUtc: now.toISOString(),
    collectedAtKst: kst.toISOString().replace('T', ' ').slice(0, 19) + ' KST',
    dateKst: kst.toISOString().slice(0, 10),
    weekdayKst: ['일', '월', '화', '수', '목', '금', '토'][kst.getUTCDay()],
    totalCount: results.reduce((sum, r) => sum + r.count, 0),
    groups: results,
  };

  await writeFile(path.join(outDir, 'latest.json'), JSON.stringify(payload, null, 2), 'utf8');
  console.log(`총 ${payload.totalCount}건 저장: data/latest.json`);

  // 한 건도 못 가져오면 실패로 끝내 Actions 에서 눈에 띄게 한다.
  if (payload.totalCount === 0) {
    process.exitCode = 1;
  }
}

main();
