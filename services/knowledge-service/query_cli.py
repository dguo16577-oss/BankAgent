"""Read-only diagnostic CLI for the internal, public-only Knowledge Service."""
import argparse
import json
import urllib.request


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('query')
    parser.add_argument('--graph', action='store_true')
    parser.add_argument('--category')
    parser.add_argument('--product-scope')
    parser.add_argument('--effective-at')
    parser.add_argument('--limit', type=int, default=5)
    args = parser.parse_args()
    payload = {k: v for k, v in {'query': args.query, 'category': args.category,
               'product_scope': args.product_scope, 'effective_at': args.effective_at,
               'limit': args.limit}.items() if v is not None}
    route = 'graph' if args.graph else 'search'
    request = urllib.request.Request('http://127.0.0.1:8002/internal/knowledge/'+route,
                                     data=json.dumps(payload).encode(),
                                     headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(request, timeout=45) as response:
        print(json.dumps(json.load(response), ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
