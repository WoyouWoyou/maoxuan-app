/** Small runtime schemas for structured-clone / JSON boundaries; no platform dependencies. */
export type Schema = (value: unknown, path: string) => void
function fail(path: string): never {
  throw new Error(`数据格式无效：${path}`)
}
export const text: Schema = (v, p) => {
  if (typeof v !== 'string' || v.length > 1_000_000) fail(p)
}
export const bool: Schema = (v, p) => {
  if (typeof v !== 'boolean') fail(p)
}
export const integer: Schema = (v, p) => {
  if (!Number.isSafeInteger(v)) fail(p)
}
export const optional =
  (schema: Schema): Schema =>
  (v, p) => {
    if (v !== undefined) schema(v, p)
  }
export const nullable =
  (schema: Schema): Schema =>
  (v, p) => {
    if (v !== null) schema(v, p)
  }
export const oneOf =
  (...values: (string | number)[]): Schema =>
  (v, p) => {
    if (!values.includes(v as string)) fail(p)
  }
export const array =
  (schema: Schema, max = 10000): Schema =>
  (v, p) => {
    if (!Array.isArray(v) || v.length > max) fail(p)
    v.forEach((item, i) => schema(item, `${p}[${i}]`))
  }
export const object =
  (fields: Record<string, Schema>, allowExtra = false): Schema =>
  (v, p) => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) fail(p)
    const value = v as Record<string, unknown>
    for (const key of Object.keys(value))
      if (!allowExtra && !Object.hasOwn(fields, key)) fail(`${p}.${key}`)
    for (const [key, schema] of Object.entries(fields)) schema(value[key], `${p}.${key}`)
  }
export function assertWith<T>(schema: Schema, value: unknown, name: string): asserts value is T {
  schema(value, name)
}

export const tagged =
  (tag: string, variants: Record<string, Schema>): Schema =>
  (value, path) => {
    if (!value || typeof value !== 'object') fail(path)
    const kind = (value as Record<string, unknown>)[tag]
    if (typeof kind !== 'string' || !Object.hasOwn(variants, kind)) fail(`${path}.${tag}`)
    variants[kind](value, path)
  }
export const tuple =
  (...items: Schema[]): Schema =>
  (value, path) => {
    if (!Array.isArray(value) || value.length > items.length) fail(path)
    items.forEach((schema, index) => schema(value[index], `${path}[${index}]`))
  }
