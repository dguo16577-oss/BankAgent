"""Deterministic display checks. No model values, bank mutations or inferred zeros."""
from datetime import datetime, timedelta
from decimal import Decimal, InvalidOperation


def display_quality(raw):
    period = raw.get('period') if isinstance(raw.get('period'), dict) else {}
    coverage = raw.get('period_coverage') if isinstance(raw.get('period_coverage'), dict) else {}
    requested_start = period.get('from', '')
    requested_end = period.get('to', '')
    start = coverage.get('covered_start', coverage.get('period_start', requested_start))
    end = coverage.get('covered_end', coverage.get('period_end', requested_end))
    missing = coverage.get('missing_periods') or []
    if not isinstance(missing, list):
        missing = ['UNKNOWN']
    status = coverage.get('coverage_status', 'UNKNOWN_COVERAGE')
    if missing:
        status = 'MISSING_PERIODS'
    elif coverage.get('is_partial_period') is True:
        status = 'PARTIAL_CURRENT_PERIOD'
    elif status not in {'COMPLETE', 'PARTIAL_CURRENT_PERIOD', 'MISSING_PERIODS', 'UNKNOWN_COVERAGE'}:
        status = 'UNKNOWN_COVERAGE'
    issues = []
    try:
        dates = [datetime.fromisoformat(v.replace('Z', '+00:00')) for v in (requested_start, requested_end, start, end)]
        if not dates[0] <= dates[2] <= dates[3] <= dates[1]:
            issues.append('INCONSISTENT_DATE_RANGE')
        if coverage.get('requested_start', requested_start) != requested_start or coverage.get('requested_end', requested_end) != requested_end:
            issues.append('INCONSISTENT_DATE_RANGE')
    except (ValueError, TypeError, AttributeError):
        status = 'UNKNOWN_COVERAGE'
        if requested_start or requested_end:
            issues.append('INVALID_DATE_RANGE')
    meta = {'status': status, 'requested_start': str(requested_start)[:32],
            'requested_end': str(requested_end)[:32], 'covered_start': str(start)[:32],
            'covered_end': str(end)[:32], 'missing_periods': [str(x)[:32] for x in missing[:24]],
            'as_of_time': str(coverage.get('as_of_time', ''))[:32]}
    totals = raw.get('totals_by_currency') if isinstance(raw.get('totals_by_currency'), dict) else {}
    scope = raw.get('scope') if isinstance(raw.get('scope'), dict) else {}
    for field, label_key in (('category_breakdown', 'category'), ('period_breakdown', 'period')):
        rows = raw.get(field)
        if rows is None or (field == 'period_breakdown' and not rows and raw.get('bucket_by', 'NONE') == 'NONE'):
            continue
        if not isinstance(rows, list):
            issues.append('INVALID_BREAKDOWN')
            continue
        if len(rows) > 24:
            issues.append('DISPLAY_ROW_LIMIT')
        sums, seen = {}, set()
        try:
            for row in rows:
                key = (row['currency'], row[label_key])
                value = Decimal(row['amount'])
                if not value.is_finite() or value < 0 or value != value.quantize(Decimal('.01')):
                    raise ValueError()
                if key in seen:
                    issues.append('DUPLICATE_BREAKDOWN')
                seen.add(key)
                sums[key[0]] = sums.get(key[0], Decimal(0)) + value
                if key[0] not in totals:
                    issues.append('UNKNOWN_CURRENCY')
                if field == 'period_breakdown' and len(str(key[1])) == 7 and str(key[1])[4] == '-':
                    if start and end and not str(start)[:7] <= str(key[1]) <= str(end)[:7]:
                        issues.append('BUCKET_OUTSIDE_PERIOD')
                if field == 'period_breakdown' and (len(str(key[1])) == 10 or '-W' in str(key[1])):
                    label = str(key[1])
                    if '-W' in label:
                        year, week = label.split('-W')
                        bucket_start = datetime.fromisocalendar(int(year), int(week), 1)
                        bucket_end = bucket_start + timedelta(days=7)
                    else:
                        bucket_start = datetime.fromisoformat(label)
                        bucket_end = bucket_start + timedelta(days=1)
                    if start and end and not (bucket_start.isoformat() < str(end).replace('Z', '+00:00')
                                               and bucket_end.isoformat() > str(start).replace('Z', '+00:00')):
                        issues.append('BUCKET_OUTSIDE_PERIOD')
            for code, total in totals.items():
                amount = Decimal(total['amount'])
                if total.get('currency', code) != code or scope.get('currency', code) != code:
                    issues.append('INCONSISTENT_CURRENCY')
                if not amount.is_finite() or amount < 0 or amount != amount.quantize(Decimal('.01')):
                    raise ValueError()
                if code not in sums:
                    if amount != 0:
                        issues.append('MISSING_BREAKDOWN')
                elif sums[code] != amount:
                    issues.append('TOTAL_MISMATCH')
        except (KeyError, InvalidOperation, ValueError, TypeError):
            issues.append('INVALID_OR_MISSING_AMOUNT')
    return meta, sorted(set(issues))
