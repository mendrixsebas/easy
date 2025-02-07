import {
  DateTime,
  entries,
  Func,
  ifDefined,
  ifNotEmpty,
  isDefined,
  isFunction,
  List,
  on,
  OneOrMore,
  Optional,
  RequireAtLeastOne,
  toArray,
  toList,
} from '@thisisagile/easy';
import { toMongoType } from './Utils';

type FuzzyOptions = {
  maxEdits: number;
  prefixLength: number;
  maxExpansions: number;
};

export type Facet =
  | { path: string; type: 'string'; numBuckets: number }
  | { path: string; type: 'number'; boundaries: number[]; default?: string }
  | { path: string; type: 'date'; boundaries: Date[]; default?: string };

export type Operator = Func<Optional<object>, string>;
export type Clause = object | Operator;
export type Clauses = Record<string, Clause>;
export type SearchDefinition = Record<
  string,
  (
    v: string | number
  ) => RequireAtLeastOne<{ should?: Clauses; filter?: Clauses; must?: Clauses; mustNot?: Clauses; sort?: Record<string, 1 | -1>; facet?: Facet }>
>;

type Compound = {
  must: OneOrMore<Clauses>;
  should: OneOrMore<Clauses>;
  mustNot: OneOrMore<Clauses>;
  filter: OneOrMore<Clauses>;
};

const should = (query: Record<string, string | number>, def: SearchDefinition): Clauses[] => entries(query).mapDefined(([k, v]) => def[k]?.(v)?.should);
const must = (query: Record<string, string | number>, def: SearchDefinition): Clauses[] => entries(query).mapDefined(([k, v]) => def[k]?.(v)?.must);
const mustNot = (query: Record<string, string | number>, def: SearchDefinition): Clauses[] => entries(query).mapDefined(([k, v]) => def[k]?.(v)?.mustNot);
const filter = (query: Record<string, string | number>, def: SearchDefinition): Clauses[] => entries(query).mapDefined(([k, v]) => def[k]?.(v)?.filter);

const compound = (query: Record<string, string | number>, def: SearchDefinition): Partial<Compound> =>
  entries({
    should: ifNotEmpty(should(query, def).concat(filter(query, def), must(query, def), mustNot(query, def)), should(query, def), [
      { wildcard: lucene.wildcard() },
    ]),
    ...ifNotEmpty(filter(query, def), f => ({ filter: f })),
    ...ifNotEmpty(mustNot(query, def), m => ({ mustNot: m })),
    ...ifNotEmpty(must(query, def), m => ({ must: m })),
  }).reduce((res, [k, v]) => on(res, r => (r[k] = lucene.clauses(v))), {} as any);

export const lucene = {
  clause: (c: Clauses) => entries(c).reduce((res, [k, v]) => res.add(isFunction(v) ? v(k) : v), toList()),
  clauses: (cs: OneOrMore<Clauses>) => toArray(cs).flatMap(c => lucene.clause(c)),
  search: (c: Partial<Compound>, index?: string) => ({
    $search: {
      ...ifDefined(index, { index }),
      compound: entries(c).reduce((res, [k, v]) => on(res, r => (r[k] = lucene.clauses(v))), {} as any),
    },
  }),
  searchWithDef: (query: Record<string, string | number>, options: SearchDefinition, index?: string) => {
    const sort = entries(query)
      .mapDefined(([k, v]) => options[k]?.(v)?.sort)
      .first();
    return {
      $search: { ...ifDefined(index, { index }), compound: compound(query, options), ...ifDefined(sort, { sort }) },
    };
  },
  searchMeta: (query: Record<string, string | number>, def: SearchDefinition, index?: string) => ({
    $searchMeta: {
      ...ifDefined(index, { index }),
      facet: {
        operator: {
          compound: compound(query, def),
        },
        facets: lucene.facets(def),
      },
    },
  }),
  exists: (): Operator => (path: string) => ({ exists: { path } }),
  text:
    (value?: OneOrMore<unknown>, fuzzy?: Partial<FuzzyOptions>): Operator =>
    (path: string) =>
      ifDefined(value, v => ({
        text: {
          path: path === 'wildcard' ? { wildcard: '*' } : path,
          query: v,
          ...ifDefined(fuzzy, { fuzzy }),
        },
      })),
  wildcard:
    (value?: OneOrMore<unknown>): Operator =>
    (path: string) => ({
      wildcard: {
        path: path === 'wildcard' ? { wildcard: '*' } : path,
        query: ifDefined(value, value, '*'),
      },
    }),
  lt:
    (value: unknown): Operator =>
    (path: string) =>
      ifDefined(value, lt => ({ range: { path, lt } })),
  lte:
    (value: unknown): Operator =>
    (path: string) =>
      ifDefined(value, lte => ({ range: { path, lte } })),
  gt:
    (value: unknown): Operator =>
    (path: string) =>
      ifDefined(value, gt => ({ range: { path, gt } })),
  gte:
    (value: unknown): Operator =>
    (path: string) =>
      ifDefined(value, gte => ({ range: { path, gte } })),
  after: (date: unknown): Operator => lucene.gte(toMongoType(date)),
  before: (date: unknown): Operator => lucene.lt(toMongoType(date)),
  between:
    (after: unknown, before: unknown): Operator =>
    (path: string) => ({
      range: {
        path,
        gte: toMongoType(after),
        lt: toMongoType(before),
      },
    }),
  facets: (def: SearchDefinition) =>
    entries(def)
      .filter(([k, v]) => isDefined(v(k)?.facet))
      .map(([k, v]) => ({ [k]: v(k)?.facet }))
      .reduce((acc, v) => ({ ...acc, ...v }), {}),
  facet: {
    string: (path: string, numBuckets = 1000): Facet => ({
      type: 'string',
      path,
      numBuckets,
    }),
    number: (path: string, boundaries: List<number>, alt?: string): Facet => ({
      type: 'number',
      path,
      boundaries,
      ...ifDefined(alt, a => ({ default: a })),
    }),
    date: (path: string, boundaries: List<DateTime>, alt?: string): Facet => ({
      type: 'date',
      path,
      boundaries: boundaries.mapDefined(b => b.toDate()),
      ...ifDefined(alt, a => ({ default: a })),
    }),
  },
};
