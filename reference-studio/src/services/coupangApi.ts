export function extractShoppingUrls(text: string): string[] {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const matches = text.match(urlRegex) || [];
  return matches.filter(url => {
    try {
      const u = new URL(url);
      return u.hostname.includes('coupang.com') ||
             u.hostname.includes('coupa.ng') ||
             u.hostname.includes('smartstore.naver.com') ||
             u.hostname.includes('brand.naver.com') ||
             u.hostname.includes('11st.co.kr') ||
             u.hostname.includes('gmarket.co.kr') ||
             u.hostname.includes('linktr.ee') ||
             u.hostname.includes('litt.ly');
    } catch {
      return false;
    }
  });
}

export function isShoppingContent(text: string): boolean {
  const keywords = [
    '쿠팡', '구매', '할인', '특가', '세일', '쇼핑', '주문', '배송', '링크',
    '내돈내산', '공구', '최저가', '꿀템', '추천템', '장바구니', '광고', '협찬',
    'buy', 'sale', 'discount', 'shop', 'link in bio'
  ];
  const lower = text.toLowerCase();
  return keywords.some(k => lower.includes(k.toLowerCase())) || extractShoppingUrls(text).length > 0;
}

export function formatCoupangAffiliateLink(originalUrl: string, subId?: string): string {
  try {
    const url = new URL(originalUrl);
    if (subId && subId.trim()) {
      url.searchParams.set('subId', subId.trim());
    }
    return url.toString();
  } catch {
    return originalUrl;
  }
}
