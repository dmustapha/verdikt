import {
  CheckResult,
  CheckDetail,
  CheckName,
  ServiceContract,
  Verdict,
  SchemaField,
} from '../types.js';

function checkHttpStatus(status: number): CheckDetail {
  return {
    name: 'HTTP_STATUS',
    passed: status === 200,
    detail: status === 200 ? 'HTTP 200 OK' : `HTTP ${status} (expected 200)`,
  };
}

function checkHasBody(body: string, minBytes: number): CheckDetail {
  const size = Buffer.byteLength(body, 'utf8');
  return {
    name: 'HAS_BODY',
    passed: size >= minBytes,
    detail:
      size >= minBytes
        ? `Body size ${size} bytes >= ${minBytes} minimum`
        : `Body size ${size} bytes < ${minBytes} minimum`,
  };
}

function checkValidJson(body: string): CheckDetail {
  try {
    JSON.parse(body);
    return { name: 'VALID_JSON', passed: true, detail: 'Valid JSON parsed' };
  } catch {
    return { name: 'VALID_JSON', passed: false, detail: 'Invalid JSON' };
  }
}

function checkSchemaMatch(
  body: string,
  schema: Record<string, SchemaField>
): CheckDetail {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(body);
  } catch {
    return { name: 'SCHEMA_MATCH', passed: false, detail: 'Cannot parse body' };
  }

  const schemaFields = Object.entries(schema);
  const mismatches: string[] = [];
  let fieldsChecked = 0;

  for (const [field, spec] of schemaFields) {
    if (!(field in parsed)) continue; // fields_present check handles missing
    fieldsChecked++;
    const val = parsed[field];
    const actual = Array.isArray(val) ? 'array' : typeof val;
    if (actual !== spec.type) {
      mismatches.push(`${field}: expected ${spec.type}, got ${actual}`);
    }
  }

  // Degenerate case: schema declares fields but none were found in response
  if (fieldsChecked === 0 && schemaFields.length > 0) {
    return {
      name: 'SCHEMA_MATCH',
      passed: false,
      detail: 'No schema fields found in response to validate',
    };
  }

  return {
    name: 'SCHEMA_MATCH',
    passed: mismatches.length === 0,
    detail:
      mismatches.length === 0
        ? `All ${fieldsChecked} fields match declared types`
        : `Type mismatches: ${mismatches.join(', ')}`,
  };
}

function checkFieldsPresent(
  body: string,
  schema: Record<string, SchemaField>
): CheckDetail {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(body);
  } catch {
    return {
      name: 'FIELDS_PRESENT',
      passed: false,
      detail: 'Cannot parse body',
    };
  }

  const missing: string[] = [];
  for (const [field, spec] of Object.entries(schema)) {
    if (!spec.required) continue;
    const val = parsed[field];
    if (val === undefined || val === null || val === '') {
      missing.push(field);
    }
  }

  return {
    name: 'FIELDS_PRESENT',
    passed: missing.length === 0,
    detail:
      missing.length === 0
        ? 'All required fields present and non-empty'
        : `Missing fields: ${missing.join(', ')}`,
  };
}

function checkValueBounds(
  body: string,
  schema: Record<string, SchemaField>
): CheckDetail {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(body);
  } catch {
    return {
      name: 'VALUE_BOUNDS',
      passed: false,
      detail: 'Cannot parse body',
    };
  }

  const violations: string[] = [];
  for (const [field, spec] of Object.entries(schema)) {
    if (spec.type !== 'number') continue;
    const val = parsed[field];
    if (typeof val !== 'number') {
      // Type mismatch — SCHEMA_MATCH handles pass/fail, but note it here for detail
      if (field in parsed) {
        violations.push(`${field}: expected number, got ${typeof val} (type mismatch)`);
      }
      continue;
    }
    if (spec.min !== undefined && val < spec.min) {
      violations.push(`${field}: ${val} < min ${spec.min}`);
    }
    if (spec.max !== undefined && val > spec.max) {
      violations.push(`${field}: ${val} > max ${spec.max}`);
    }
    if (spec.enum && !spec.enum.includes(String(val))) {
      violations.push(`${field}: ${val} not in enum`);
    }
  }

  // Also check string enums
  for (const [field, spec] of Object.entries(schema)) {
    if (spec.type !== 'string' || !spec.enum) continue;
    const val = parsed[field];
    if (typeof val !== 'string') continue;
    if (!spec.enum.includes(val)) {
      violations.push(`${field}: "${val}" not in [${spec.enum.join(', ')}]`);
    }
  }

  return {
    name: 'VALUE_BOUNDS',
    passed: violations.length === 0,
    detail:
      violations.length === 0
        ? 'All values within declared bounds'
        : `Bound violations: ${violations.join(', ')}`,
  };
}

function determineVerdict(passed: number, total: number): Verdict {
  const ratio = passed / total;
  if (ratio >= 5 / 6) return 'VALID'; // 5-6 of 6
  if (ratio >= 3 / 6) return 'PARTIAL'; // 3-4 of 6
  return 'GUILTY'; // 0-2 of 6
}

export function runQualityGate(
  httpStatus: number,
  responseBody: string,
  serviceContract: ServiceContract
): CheckResult {
  const checks: CheckDetail[] = [
    checkHttpStatus(httpStatus),
    checkHasBody(responseBody, serviceContract.min_response_bytes),
    checkValidJson(responseBody),
    checkSchemaMatch(responseBody, serviceContract.promised_schema),
    checkFieldsPresent(responseBody, serviceContract.promised_schema),
    checkValueBounds(responseBody, serviceContract.promised_schema),
  ];

  const passed = checks.filter((c) => c.passed).length;
  const total = checks.length;

  return {
    checks,
    passed,
    total,
    verdict: determineVerdict(passed, total),
  };
}
