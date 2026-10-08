export type Row = Record<string, unknown>;

export interface Queryable {
  /** Runs one parameterised statement ($1, $2, ...) and returns its rows. */
  query<T extends object = Row>(sql: string, params?: readonly unknown[]): Promise<T[]>;
  /** Runs one or more statements without parameters (used by migrations). */
  exec(sql: string): Promise<void>;
}

export interface Database extends Queryable {
  /** Runs `work` in a transaction: commits when it resolves, rolls back when it throws. */
  transaction<T>(work: (tx: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

/** Postgres type OIDs we convert to friendlier JavaScript values, shared by both adapters. */
const OID = { int8: 20, numeric: 1700, date: 1082, timestamptz: 1184 } as const;

export const TYPE_PARSERS: Record<number, (value: string) => unknown> = {
  [OID.int8]: (value) => Number(value),
  [OID.numeric]: (value) => Number.parseFloat(value),
  // Dates stay plain 'YYYY-MM-DD' strings: no time zone surprises.
  [OID.date]: (value) => value,
  [OID.timestamptz]: (value) => new Date(value).toISOString(),
};
