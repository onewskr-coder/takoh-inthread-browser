"""Explicit provider operations. No credentials or raw provider errors are stored."""
from datetime import datetime, timezone
import hashlib
import hmac
import ipaddress
import re
from urllib.parse import urlparse

import requests


class IntegrationError(Exception):
    def __init__(self, message, status=502, uncertain=False):
        self.message, self.status, self.uncertain = message, status, uncertain


def request_json(method, url, **kwargs):
    try:
        response = requests.request(method, url, timeout=45, allow_redirects=False, **kwargs)
    except requests.RequestException:
        raise IntegrationError('외부 서비스 연결 실패. 발행 중이었다면 결과를 확인해야 합니다.', uncertain=method == 'POST')
    if not 200 <= response.status_code < 300:
        detail = ''
        try:
            err_body = response.json()
            if isinstance(err_body, dict):
                msg = str(err_body.get('message') or err_body.get('error') or '')
                if 'revoked' in msg.lower():
                    detail = ' (등록된 API 키가 폐기(revoked)되었거나 만료되었습니다. 새 키를 발급받아 등록해 주세요.)'
        except Exception:
            pass
        raise IntegrationError(f'외부 서비스 요청 실패 (HTTP {response.status_code}). 권한·한도를 확인해 주세요.{detail}',
                               status=429 if response.status_code == 429 else 502,
                               uncertain=method == 'POST' and response.status_code >= 500)
    try:
        data = response.json()
        if not isinstance(data, dict):
            raise ValueError()
        return data
    except ValueError:
        raise IntegrationError('외부 서비스 응답을 확인하지 못했습니다.', uncertain=method == 'POST')


def https_url(value):
    if not isinstance(value, str):
        raise IntegrationError('HTTPS 주소를 입력해 주세요.', 400)
    parsed = urlparse(value.strip())
    if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password or len(value) > 2048:
        raise IntegrationError('HTTPS 주소를 입력해 주세요.', 400)
    return value.strip()


def public_video_url(value):
    value = https_url(value)
    host = urlparse(value).hostname.lower()
    if host == 'localhost' or host.endswith(('.localhost', '.local')) or '.' not in host:
        raise IntegrationError('Meta에서 접근할 수 있는 공개 HTTPS 영상 주소가 필요합니다.', 400)
    try:
        if not ipaddress.ip_address(host).is_global:
            raise IntegrationError('로컬·내부 IP 주소를 영상 주소로 사용할 수 없습니다.', 400)
    except ValueError:
        pass
    return value


def _matches_platform_domain(url, platform):
    host = (urlparse(url).hostname or '').lower()
    if platform == 'coupang':
        return host == 'coupang.com' or host.endswith('.coupang.com') or host == 'coupa.ng'
    if platform == 'amazon':
        return host == 'amazon.com' or host.endswith('.amazon.com') or host == 'amzn.to'
    if platform == 'naver':
        return host == 'naver.com' or host.endswith('.naver.com') or host == 'naver.me'
    return True


def search_products(query, platform, key):
    if not key:
        raise IntegrationError('SerpAPI 키를 입력해 주세요.', 400)
    if not isinstance(query, str) or not 1 <= len(query.strip()) <= 200:
        raise IntegrationError('200자 이하 상품 검색어를 입력해 주세요.', 400)
    sites = {'coupang': 'site:www.coupang.com/vp/products', 'amazon': 'site:amazon.com',
             'naver': '(site:shopping.naver.com OR site:smartstore.naver.com)', 'toss': '토스쇼핑'}
    if platform not in sites:
        raise IntegrationError('검색할 서비스를 선택해 주세요.', 400)
    # Organic product-page candidates preserve the merchant URL rather than a Google Shopping detail URL.
    data = request_json('GET', 'https://serpapi.com/search.json', params={
        'engine': 'google', 'q': f'{sites[platform]} {query.strip()}', 'hl': 'ko', 'gl': 'kr', 'api_key': key})
    if data.get('error'):
        raise IntegrationError('상품 검색에 실패했습니다. 검색 API 키와 한도를 확인해 주세요.')
    items = list(data.get('organic_results', []))
    if platform == 'coupang' and not any(_matches_platform_domain(str(x.get('link', '')), 'coupang') for x in items):
        fallback_data = request_json('GET', 'https://serpapi.com/search.json', params={
            'engine': 'google', 'q': f'site:coupang.com {query.strip()}', 'hl': 'ko', 'gl': 'kr', 'api_key': key})
        items.extend(fallback_data.get('organic_results', []))
    results = []
    seen = set()
    for item in items:
        try:
            url = https_url(item.get('link'))
        except IntegrationError:
            continue
        if url in seen or not _matches_platform_domain(url, platform):
            continue
        seen.add(url)
        results.append(dict(name=str(item.get('title', ''))[:200], url=url, platform=platform,
                            snippet=str(item.get('snippet', ''))[:500], verification='discovered'))
        if len(results) >= 10:
            break
    return results


COUPANG_PATH = '/v2/providers/affiliate_open_api/apis/openapi/v1/deeplink'


def search_visual(image_path, key, mode):
    if not key:
        raise IntegrationError('SerpAPI 키를 입력해 주세요.', 400)
    if mode not in ('products', 'exact_matches', 'visual_matches'):
        raise IntegrationError('이미지 검색 유형을 선택해 주세요.', 400)
    if image_path.stat().st_size > 500 * 1024:
        raise IntegrationError('검색 이미지가 500KB를 넘습니다.', 400)
    with image_path.open('rb') as handle:
        upload = request_json('POST', 'https://serpapi.com/image', data={'api_key': key},
                              files={'image': ('reference.jpg', handle, 'image/jpeg')})
    image_id = upload.get('image_id')
    if not isinstance(image_id, str) or not image_id:
        raise IntegrationError('SerpAPI 이미지 업로드 결과를 확인하지 못했습니다.')
    data = request_json('GET', 'https://serpapi.com/search.json', params={
        'engine': 'google_lens', 'image_id': image_id, 'type': mode, 'api_key': key, 'hl': 'ko'})
    if data.get('error'):
        raise IntegrationError('이미지 검색에 실패했습니다. API 한도를 확인해 주세요.')
    results = []
    groups = ('exact_matches',) if mode == 'exact_matches' else ('visual_matches', 'products')
    for group in groups:
        for item in data.get(group, [])[:20]:
            try:
                url = https_url(item.get('link'))
            except IntegrationError:
                continue
            image = item.get('image') or item.get('thumbnail')
            try:
                image = https_url(image)
            except IntegrationError:
                image = None
            results.append(dict(name=str(item.get('title', ''))[:200], url=url, image=image,
                                source=str(item.get('source', ''))[:200], kind='product' if mode == 'products' else 'content',
                                match_type=mode, verification='discovered', same_video_verified=False))
    return results


def coupang_deeplink(url, access, secret):
    url = https_url(url)
    host = urlparse(url).hostname.lower()
    if host != 'coupang.com' and not host.endswith('.coupang.com'):
        raise IntegrationError('쿠팡의 일반 상품 URL을 입력해 주세요.', 400)
    if not access or not secret:
        raise IntegrationError('쿠팡파트너스 Access Key와 Secret Key를 입력해 주세요.', 400)
    date = datetime.now(timezone.utc).strftime('%y%m%dT%H%M%SZ')
    signature = hmac.new(secret.encode(), (date + 'POST' + COUPANG_PATH).encode(), hashlib.sha256).hexdigest()
    authorization = f'CEA algorithm=HmacSHA256, access-key={access}, signed-date={date}, signature={signature}'
    data = request_json('POST', 'https://api-gateway.coupang.com' + COUPANG_PATH,
                        headers={'Authorization': authorization}, json={'coupangUrls': [url]})
    if str(data.get('rCode')) != '0':
        raise IntegrationError('쿠팡파트너스가 링크 발급을 거절했습니다. 키와 API 이용 권한을 확인해 주세요.')
    rows = data.get('data')
    if not isinstance(rows, list):
        raise IntegrationError('쿠팡 링크 발급 결과가 올바르지 않습니다.')
    for item in rows:
        if item.get('originalUrl') == url:
            result = https_url(item.get('shortenUrl') or item.get('landingUrl'))
            host = urlparse(result).hostname.lower()
            if host == 'coupa.ng' or host == 'link.coupang.com':
                return result
    raise IntegrationError('입력한 상품과 일치하는 제휴 링크 발급 결과가 없습니다.')


def identifier(value):
    value = str(value or '')
    if not re.fullmatch(r'\d{1,40}', value):
        raise IntegrationError('Threads 식별자를 확인하지 못했습니다.')
    return value


def threads_api(token, method, path, fields=None):
    if not token:
        raise IntegrationError('Threads 액세스 토큰을 입력해 주세요.', 400)
    return request_json(method, 'https://graph.threads.net/v1.0/' + path,
        headers={'Authorization': 'Bearer ' + token}, **({'params': fields or {}} if method == 'GET' else {'data': fields or {}}))


def threads_account(token):
    data = threads_api(token, 'GET', 'me', {'fields': 'id,username'})
    return {'id': identifier(data.get('id')), 'username': str(data.get('username', ''))}


def publish_container(token, account_id, container_id):
    data = threads_api(token, 'POST', account_id + '/threads_publish', {'creation_id': container_id})
    try:
        return identifier(data.get('id'))
    except IntegrationError:
        raise IntegrationError('발행 응답에 게시 ID가 없습니다. 실제 결과를 확인해야 합니다.', uncertain=True)


def recover_publication(job, token, account, media_id, save):
    p = job['publication']
    if p.get('account_id') != account['id']:
        raise IntegrationError('발행을 시작한 계정으로 확인해 주세요.', 409)
    stage = 'post' if p.get('post_pending') else 'comment' if p.get('comment_pending') else None
    if not stage:
        raise IntegrationError('확인이 필요한 불확실한 발행 요청이 없습니다.', 409)
    media_id = identifier(media_id)
    result = threads_api(token, 'GET', media_id, {'fields': 'id,text,username,media_type,is_reply,replied_to,permalink'})
    expected = p['body'] if stage == 'post' else p['comment']
    if result.get('id') != media_id or result.get('username') != account['username'] or result.get('text') != expected:
        raise IntegrationError('입력한 게시물의 계정·ID·내용이 이 작업과 일치하지 않습니다.', 409)
    if stage == 'post':
        if result.get('media_type') != p.get('media_type', 'VIDEO') or result.get('is_reply') is True:
            raise IntegrationError('이 작업의 동영상 본문 게시물이 아닙니다.', 409)
        p.update(post_id=media_id, post_pending=False, post_verified=True, permalink=result.get('permalink'), status='partial_success')
    else:
        if result.get('is_reply') is not True or result.get('replied_to', {}).get('id') != p['post_id']:
            raise IntegrationError('광고 댓글의 부모 게시물이 일치하지 않습니다.', 409)
        p.update(comment_id=media_id, comment_pending=False, comment_verified=True, status='published')
        job['status'] = 'published'
    p['error'] = None
    save(job)
    return job


def advance_publication(job, token, account, video_url, save):
    """Persist before publishing; never repeat an uncertain publish request."""
    p = job['publication']
    if p.get('account_id') and p['account_id'] != account['id']:
        raise IntegrationError('이 작업을 시작한 Threads 계정으로 연결해 주세요.', 409)
    if p.get('status') == 'published':
        return job
    if p.get('post_pending') or p.get('comment_pending'):
        raise IntegrationError('이전 발행 결과가 불확실합니다. 중복 방지를 위해 재발행을 중지했습니다. Threads에서 결과를 확인해 주세요.', 409)
    if not p.get('account_id'):
        p.update(account_id=account['id'], username=account['username'], video_url=public_video_url(video_url),
                 body=job['draft']['body'], comment=job['comment'], media_sha256=job['sha256'],
                 media_type='IMAGE' if job.get('kind') == 'image' else 'VIDEO')
        save(job)
    try:
        if not p.get('container_id'):
            p['container_id'] = identifier(threads_api(token, 'POST', account['id'] + '/threads',
                {'media_type': p.get('media_type', 'VIDEO'),
                 'image_url' if p.get('media_type') == 'IMAGE' else 'video_url': p['video_url'], 'text': p['body']}).get('id'))
            p['status'] = 'media_processing'
            save(job)
        if not p.get('post_id'):
            state = threads_api(token, 'GET', p['container_id'], {'fields': 'status,error_message'}).get('status')
            if state == 'IN_PROGRESS':
                p['status'] = 'media_processing'
                save(job)
                return job
            if state != 'FINISHED':
                raise IntegrationError('영상 컨테이너가 발행 가능한 상태가 아닙니다. 새 본문을 만들지 않았습니다.', 409)
            p.update(post_pending=True, status='post_publishing')
            save(job)
            try:
                p['post_id'] = publish_container(token, account['id'], p['container_id'])
            except IntegrationError as error:
                if not error.uncertain:
                    p['post_pending'] = False
                raise
            p.update(post_pending=False, status='post_published')
            save(job)
        if not p.get('post_verified'):
            result = threads_api(token, 'GET', p['post_id'], {'fields': 'id,text,permalink'})
            if result.get('id') != p['post_id'] or result.get('text') != p['body']:
                raise IntegrationError('발행한 본문 ID와 내용을 확인하지 못했습니다. 댓글을 올리지 않았습니다.', 409)
            p.update(post_verified=True, permalink=result.get('permalink'))
            save(job)
        if not p.get('comment_container_id'):
            p['comment_container_id'] = identifier(threads_api(token, 'POST', account['id'] + '/threads',
                {'media_type': 'TEXT', 'text': p['comment'], 'reply_to_id': p['post_id']}).get('id'))
            save(job)
        if not p.get('comment_id'):
            state = threads_api(token, 'GET', p['comment_container_id'], {'fields': 'status,error_message'}).get('status')
            if state == 'IN_PROGRESS':
                p['status'] = 'comment_processing'
                save(job)
                return job
            if state != 'FINISHED':
                raise IntegrationError('댓글 컨테이너가 발행 가능한 상태가 아닙니다.', 409)
            p.update(comment_pending=True, status='comment_publishing')
            save(job)
            try:
                p['comment_id'] = publish_container(token, account['id'], p['comment_container_id'])
            except IntegrationError as error:
                if not error.uncertain:
                    p['comment_pending'] = False
                raise
            p.update(comment_pending=False, status='comment_published')
            save(job)
        reply = threads_api(token, 'GET', p['comment_id'], {'fields': 'id,text,is_reply,replied_to'})
        if reply.get('id') != p['comment_id'] or reply.get('text') != p['comment'] or reply.get('is_reply') is not True or reply.get('replied_to', {}).get('id') != p['post_id']:
            raise IntegrationError('댓글 ID·내용·부모 게시물을 확인하지 못했습니다.', 409)
        p.update(status='published', comment_verified=True, error=None)
        job['status'] = 'published'
        save(job)
        return job
    except IntegrationError as error:
        p['error'] = error.message
        if p.get('post_pending') or p.get('comment_pending'):
            p['status'] = 'publish_uncertain'
        elif p.get('post_id'):
            p['status'] = 'partial_success'
        else:
            p['status'] = 'failed'
        save(job)
        raise
