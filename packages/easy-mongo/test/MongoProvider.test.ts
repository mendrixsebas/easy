import { AbstractCursor, Collection, CreateIndexesOptions, Db, FindOptions as MongoFindOptions, IndexSpecification, MongoClient } from 'mongodb';
import { FindOptions, Indexes, IndexOptions, MongoProvider } from '../src';
import { fits, mock } from '@thisisagile/easy-test';
import { Dev, devData } from '@thisisagile/easy/test/ref';
import { DevCollection } from './ref/DevCollection';
import { asc, Database, DateTime, DefaultProvider, desc, Exception, Field, Id, JsonValue, toCondition } from '@thisisagile/easy';

describe('MongoProvider', () => {
  let client: MongoClient;
  let db: Db;
  const c = {} as Collection;
  const cursor = mock.a<AbstractCursor>({ toArray: mock.return([]) });
  let provider: MongoProvider;
  const devs = new DevCollection();
  const filter = { name: { $exists: true } };
  const date = '2023-09-22T12:30:00.000+00:00';
  let connect: any;

  beforeEach(() => {
    c.find = mock.resolve({ toArray: () => Promise.resolve([]) });
    client = mock.empty<MongoClient>({ connect: mock.impl(() => client) });
    db = mock.empty<Db>();
    db.collection = mock.resolve({ collectionName: 'devCollection' });
    client.db = mock.resolve(db);
    provider = new MongoProvider(devs, Promise.resolve(client));
    connect = jest.spyOn(MongoClient as any, 'connect').mockResolvedValue(client);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('client calls MongoClient connect', async () => {
    (MongoProvider as any).clients = {};
    await expect(MongoProvider.client(new Database('db', DefaultProvider, { cluster: 'clstr' }))).resolves.toEqual(client);
    expect(connect).toHaveBeenCalledWith('clstr', { auth: { password: '', username: '' } });
  });

  test('client calls MongoClient connect once per cluster', async () => {
    (MongoProvider as any).clients = {};
    await expect(MongoProvider.client(new Database('db1', DefaultProvider, { cluster: 'clstr' }))).resolves.toEqual(client);
    await expect(MongoProvider.client(new Database('db2', DefaultProvider, { cluster: 'clstr2' }))).resolves.toEqual(client);
    expect(connect).toHaveBeenCalledTimes(2);
  });

  test('client calls MongoClient connect once for same cluster', async () => {
    (MongoProvider as any).clients = {};
    await expect(MongoProvider.client(new Database('db1', DefaultProvider, { cluster: 'clstr' }))).resolves.toEqual(client);
    await expect(MongoProvider.client(new Database('db2', DefaultProvider, { cluster: 'clstr' }))).resolves.toEqual(client);
    await expect(MongoProvider.client(new Database('db2', DefaultProvider, { cluster: 'clstr' }))).resolves.toEqual(client);
    expect(connect).toHaveBeenCalledTimes(1);
  });

  test('client passes the options to the Mongo client', async () => {
    (MongoProvider as any).clients = {};
    await expect(
      MongoProvider.client(new Database('db', DefaultProvider, { cluster: 'clstr', maxPoolSize: 20, minPoolSize: 15, maxIdleTimeMS: 42 }))
    ).resolves.toEqual(client);
    expect(connect).toHaveBeenCalledWith('clstr', { auth: { password: '', username: '' }, maxPoolSize: 20, minPoolSize: 15, maxIdleTimeMS: 42 });
  });

  test('all calls find', async () => {
    provider.find = mock.resolve(devData);
    await expect(provider.all()).resolves.toBe(devData);
    expect(provider.find).toHaveBeenCalledWith({}, undefined);
  });

  test('all calls find with options', async () => {
    provider.find = mock.resolve(devData);
    const options = { limit: 300, skip: 4 };
    await expect(provider.all(options)).resolves.toBe(devData);
    expect(provider.find).toHaveBeenCalledWith({}, options);
  });

  test('byId calls findOne on the collection', async () => {
    const findOne = mock.resolve(devData.jeroen);
    provider.collection = mock.resolve({ findOne });
    await expect(provider.byId('42')).resolves.toStrictEqual(devData.jeroen);
    return expect(findOne).toHaveBeenCalledWith({ id: '42' }, expect.anything());
  });

  test('byId calls findOne and adds _id to the projection by default', async () => {
    const findOne = mock.resolve(devData.jeroen);
    provider.collection = mock.resolve({ findOne });
    await expect(provider.byId('42')).resolves.toStrictEqual(devData.jeroen);
    return expect(findOne).toHaveBeenCalledWith({ id: '42' }, fits.json({ projection: { _id: 0 } }));
  });

  test('mongoIds are by default in the projection.', async () => {
    provider.collection = mock.resolve(c);
    await provider.find({});
    expect(c.find).toHaveBeenCalledWith(expect.anything(), fits.json({ projection: { _id: 0 } }));
  });

  test('add projection to mongo query.', async () => {
    provider.collection = mock.resolve(c);
    await provider.find({}, { projection: { id: 1, _id: 1 } });
    expect(c.find).toHaveBeenCalledWith(expect.anything(), fits.json({ projection: { _id: 1, id: 1 } }));
  });

  test('find calls find on the collection', async () => {
    cursor.toArray = mock.resolve([devData.jeroen, devData.wouter]);
    c.find = mock.resolve(cursor);
    provider.collection = mock.resolve(c);
    const res = await provider.find([{ id: '42' }]);
    expect(res.last()).toMatchObject(devData.wouter);
  });

  test('find with undefined calls find on the collection with default options', async () => {
    provider.collection = mock.resolve(c);
    await provider.find({});
    expect(c.find).toHaveBeenCalledWith(expect.anything(), { limit: 250, total: false, projection: { _id: 0 } });
  });

  test('find with with only skip keeps limit', async () => {
    c.countDocuments = mock.resolve(42);
    provider.collection = mock.resolve(c);
    await provider.find({}, { skip: 3 });
    expect(c.find).toHaveBeenCalledWith({}, fits.json({ skip: 3, limit: 250 }));
  });

  test('find without options doesnt call count', async () => {
    c.countDocuments = mock.resolve(42);
    provider.collection = mock.resolve(c);
    const r = await provider.find({});
    expect(c.countDocuments).not.toHaveBeenCalled();
    expect(r.total).toBeUndefined();
  });

  test('find with options calls count', async () => {
    c.countDocuments = mock.resolve(42);
    provider.collection = mock.resolve(c);
    const r = await provider.find(devs.where(devs.name.is('Jeroen')), {
      take: 2,
      sort: [devs.name.desc(), devs.language.asc()],
    });
    expect(c.countDocuments).toHaveBeenCalledWith({ $and: [{ Name: { $eq: 'Jeroen' } }] });
    expect(r.total).toBe(42);
  });

  test('find calls toMongoType on queries, to correct dates', async () => {
    provider.collection = mock.resolve(c);

    await provider.find({ date: date });

    expect(c.find).toHaveBeenCalledWith({ date: new DateTime(date).toDate() }, expect.anything());
    expect(c.find).not.toHaveBeenCalledWith({ date: date }, expect.anything());
  });

  test('find with sort options', async () => {
    c.countDocuments = mock.resolve(42);
    provider.collection = mock.resolve(c);
    await provider.find(devs.where(devs.name.is('Jeroen')), { take: 2, sort: [devs.name.desc(), devs.language.asc()] });
    expect(c.find).toHaveBeenCalledWith(
      { $and: [{ Name: { $eq: 'Jeroen' } }] },
      fits.json({
        limit: 2,
        sort: { Name: -1, Language: 1 },
        total: true,
      })
    );
  });

  test('find with sort', async () => {
    provider.collection = mock.resolve(c);
    await provider.find(devs.where(devs.name.is('Jeroen')), { sort: [devs.name.desc(), devs.language.asc()] });
    expect(c.find).toHaveBeenCalledWith(fits.any(), fits.with({ sort: { Name: -1, Language: 1 } }));
  });

  test('find with sorts', async () => {
    provider.collection = mock.resolve(c);
    await provider.find(devs.where(devs.name.is('Jeroen')), { sorts: { Name: desc, Language: asc } });
    expect(c.find).toHaveBeenCalledWith(fits.any(), fits.with({ sort: { Name: -1, Language: 1 } }));
  });

  test('find returns original options', async () => {
    c.countDocuments = mock.resolve(42);
    provider.collection = mock.resolve(c);
    const r = await provider.find({}, { take: 2, skip: 1 });
    expect(c.find).toHaveBeenCalledWith({}, fits.json({ limit: 2, total: true, skip: 1 }));
    expect(r.options).toEqual({ take: 2, skip: 1, total: 42 });
  });

  test('group calls aggregate on the collection', () => {
    cursor.toArray = mock.resolve([devData.jeroen, devData.wouter, devData.naoufal]);
    c.aggregate = mock.resolve(cursor);
    provider.collection = mock.resolve(c);
    return expect(provider.group([{ id: '42' }])).resolves.toHaveLength(3);
  });

  test('group calls toMongoType on queries, to correct dates', async () => {
    provider.collection = mock.resolve(c);
    c.aggregate = mock.resolve({ toArray: () => Promise.resolve([]) });

    await provider.group([{ date: date }]);

    expect(c.aggregate).toHaveBeenCalledWith([{ date: new DateTime(date).toDate() }]);
    expect(c.aggregate).not.toHaveBeenCalledWith([{ date: date }]);
  });

  test('by calls find on the collection', async () => {
    cursor.toArray = mock.resolve([devData.jeroen, devData.wouter]);
    c.find = mock.resolve(cursor);
    provider.collection = mock.resolve(c);
    const res = await provider.by('level', 1);
    expect(res.last()).toMatchObject(devData.wouter);
    expect(c.find).toHaveBeenCalledWith({ level: 1 }, expect.anything());
  });

  test.each([
    [1, 1],
    ['42', '42'],
    [true, true],
    [{ id: 42 }, { id: 42 }],
  ])('by does not convert the value to a string. This is done in the past see before 06-12-2022', async (value: JsonValue, exp: any) => {
    provider.find = mock.resolve();
    await provider.by('level', value, {});
    expect(provider.find).toHaveBeenCalledWith({ level: exp }, expect.anything());
  });

  test.each([
    [1, 1],
    ['42', '42'],
  ])('byId does not convert the value to a string. This is done in the past see before 06-12-2022', async (value: Id, exp: any) => {
    c.findOne = mock.resolve();
    provider.collection = mock.resolve(c);
    await provider.byId(value);
    expect(c.findOne).toHaveBeenCalledWith({ id: exp }, expect.anything());
  });

  test('add calls insertOne on the collection', async () => {
    c.insertOne = mock.resolve({ ops: [devData.jeroen] });
    provider.collection = mock.resolve(c);
    await expect(provider.add(devData.jeroen)).resolves.toStrictEqual(devData.jeroen);
    expect(c.insertOne).toHaveBeenCalledWith(devData.jeroen);
  });

  test('update calls updateOne on the collection and the byId to return the modified item', async () => {
    c.updateOne = mock.resolve();
    provider.collection = mock.resolve(c);
    provider.byId = mock.resolve(Dev.Jeroen.toJSON());
    await expect(provider.update(Dev.Jeroen.toJSON())).resolves.toStrictEqual(Dev.Jeroen.toJSON());
    expect(c.updateOne).toHaveBeenCalledWith({ id: Dev.Jeroen.id }, { $set: Dev.Jeroen.toJSON() });
  });

  test('toMongoJson', () => {
    const q = { Id: { $eq: 42 } };
    expect(provider.toMongoJson(q)).toEqual(q);
    expect(provider.toMongoJson(toCondition('Id', 'eq', 42))).toEqual(q);
    expect(provider.toMongoJson(devs.id.is(42).and(devs.name.is('sander')))).toEqual({ $and: [q, { Name: { $eq: 'sander' } }] });
  });

  test('remove calls deleteOne on the collection', async () => {
    c.deleteOne = mock.resolve({ acknowledged: true });
    provider.collection = mock.resolve(c);
    await expect(provider.remove(42)).resolves.toBeTruthy();
    expect(c.deleteOne).toHaveBeenCalledWith({ id: 42 });
  });

  test('remove calls deleteOne on the collection with id as string', async () => {
    c.deleteOne = mock.resolve({ acknowledged: true });
    provider.collection = mock.resolve(c);
    await expect(provider.remove('42')).resolves.toBeTruthy();
    expect(c.deleteOne).toHaveBeenCalledWith({ id: '42' });
  });

  test('remove calls deleteOne and rejects when deleteOne does not acknowledges', async () => {
    c.deleteOne = mock.resolve({ acknowledged: false });
    provider.collection = mock.resolve(c);
    await expect(provider.remove('42')).resolves.toBeFalsy();
    expect(c.deleteOne).toHaveBeenCalledWith({ id: '42' });
  });

  test('count calls countDocuments on the collection', async () => {
    c.countDocuments = mock.resolve(42);
    provider.collection = mock.resolve(c);
    await expect(provider.count()).resolves.toBe(42);
    expect(c.countDocuments).toHaveBeenCalled();
  });

  test('count calls toMongoType on queries, to correct dates', async () => {
    provider.collection = mock.resolve(c);
    cursor.toArray = mock.resolve([]);
    c.countDocuments = mock.resolve(cursor);

    await provider.count({ date: date });

    expect(c.countDocuments).toHaveBeenCalledWith({ date: new DateTime(date).toDate() });
    expect(c.countDocuments).not.toHaveBeenCalledWith({ date: date });
  });

  class TestMongoProvider extends MongoProvider {
    toIndexSpecification(index: Indexes): IndexSpecification {
      return super.toIndexSpecification(index);
    }

    toCreateIndexesOptions(options?: IndexOptions): CreateIndexesOptions {
      return super.toCreateIndexesOptions(options);
    }

    toFindOptions(options?: FindOptions): MongoFindOptions & { total: boolean } {
      return super.toFindOptions(options);
    }
  }

  test.each([
    ['with undefined as unknown as string', undefined as unknown as string, undefined],
    ['with string', 'name', 'name'],
    ['with string array', ['name', 'id'], ['name', 'id']],
    ['with field', new Field('name'), 'name'],
    ['with field array', [new Field('name'), new Field('id')], ['name', 'id']],
    ['with sorted field', new Field('name').asc(), { name: 1 }],
    ['with sorted field array', [new Field('name').asc(), new Field('id').desc()], [{ name: 1 }, { id: -1 }]],
    ['with empty object', {}, {}],
    ['with object', { name: 1 } as Record<string, 1 | -1>, { name: 1 }],
    ['with object array', [{ name: 1 }, { id: -1 }] as Record<string, 1 | -1>[], [{ name: 1 }, { id: -1 }]],
  ])('IndexSpecification %s', (name, s, expected) => {
    const p = new TestMongoProvider(devs, Promise.resolve(client));
    expect(p.toIndexSpecification(s)).toStrictEqual(expected);
  });

  test.each([
    ['with undefined', undefined, {}],
    ['defaults unique', {}, { unique: true }],
    ['with unique', { unique: false }, { unique: false }],
    ['with default language', { languageDefault: 'en' }, { default_language: 'en' }],
    ['with override language', { languageOverride: 'en' }, { language_override: 'en' }],
    ['with filter', { filter: devs.name.isIn('john').toJSON() }, { partialFilterExpression: { Name: { $in: ['john'] } } }],
    ['with filter undefined', { filter: undefined }, {}],
    ['with condition', { filter: devs.name.exists(true) }, { partialFilterExpression: { Name: { $exists: true } } }],
  ])('CreateIndexesOptions %s', (name, o, expected) => {
    const p = new TestMongoProvider(devs, Promise.resolve(client));
    expect(p.toCreateIndexesOptions(o)).toMatchJson(fits.json({ ...expected }));
  });

  test('CreateIndexesOptions uses the correct dates', () => {
    const p = new TestMongoProvider(devs, Promise.resolve(client));
    expect(p.toCreateIndexesOptions({ filter: { date } })).toMatchJson(fits.json({ partialFilterExpression: { date: new DateTime(date).toDate() } }));
  });

  test('createIndex calls createIndex on the collection', async () => {
    c.createIndex = mock.resolve('_index');
    provider.collection = mock.resolve(c);
    await expect(provider.createIndex('name')).resolves.toBe('_index');
    expect(c.createIndex).toHaveBeenCalledWith('name', fits.json({ unique: true }));
  });

  test('createIndex with options', async () => {
    c.createIndex = mock.resolve('_index');
    provider.collection = mock.resolve(c);
    await expect(provider.createIndex('name', { unique: false })).resolves.toBe('_index');
    expect(c.createIndex).toHaveBeenCalledWith('name', fits.json({ unique: false }));
  });

  test('createTextIndex on the collection', async () => {
    c.createIndex = mock.resolve('Language_text_Name_text');
    provider.collection = mock.resolve(c);
    await expect(provider.createTextIndex([devs.language, devs.name])).resolves.toBe('Language_text_Name_text');
    expect(c.createIndex).toHaveBeenCalledWith({ Language: 'text', Name: 'text' }, expect.anything());
  });

  test('createTextIndex is default non unique', async () => {
    const p = new TestMongoProvider(devs, Promise.resolve(client));
    p.createIndex = mock.resolve('_index');
    await expect(p.createTextIndex('name')).resolves.toBe('_index');
    expect(p.createIndex).toHaveBeenCalledWith({ name: 'text' }, { unique: false });
  });

  test('createPartialIndex with filter', async () => {
    const p = new TestMongoProvider(devs, Promise.resolve(client));
    p.createIndex = mock.resolve('_index');
    await expect(p.createPartialIndex('name', filter, { unique: false })).resolves.toBe('_index');
    expect(p.createIndex).toHaveBeenCalledWith('name', { filter, unique: false });
  });

  test('createPartialIndex with condition', async () => {
    const p = new TestMongoProvider(devs, Promise.resolve(client));
    p.createIndex = mock.resolve('_index');
    await expect(p.createPartialIndex('name', devs.name.exists(true))).resolves.toBe('_index');
    expect(p.createIndex).toHaveBeenCalledWith('name', { filter: fits.json(devs.name.exists(true).toJSON()) });
  });

  test.each([
    ['with undefined', undefined as unknown as FindOptions, { limit: 250, total: false, projection: { _id: 0 } }],
    ['with custom take', { take: 300 } as FindOptions, { limit: 300, total: true, projection: { _id: 0 } }],
    ['with custom take and skip', { take: 300, skip: 300 } as FindOptions, { limit: 300, skip: 300, total: true, projection: { _id: 0 } }],
    ['with sort', { sort: [{ key: 'id', value: 1 }] } as FindOptions, { limit: 250, total: false, sort: { id: 1 }, projection: { _id: 0 } }],
    ['with custom projection', { projection: { id: 1 } } as FindOptions, { limit: 250, total: false, projection: { id: 1 } }],
    ['with custom projections', { projection: { id: 1, _id: 1 } } as FindOptions, { limit: 250, total: false, projection: { id: 1, _id: 1 } }],
    ['with string type skip and take', { take: "42", skip: "43" } as unknown as FindOptions, { limit: 42, skip: 43, total: true, projection: { _id: 0 } }],
  ])('toFindOptions %s', (name, s, expected) => {
    const p = new TestMongoProvider(devs, Promise.resolve(client));
    expect(p.toFindOptions(s)).toStrictEqual(expected);
  });

  test('first time connect fails set client to undefined', async () => {
    provider = new MongoProvider(devs);
    MongoProvider.client = mock.reject(Exception.IsNotValid);
    await expect(provider.collection()).rejects.toBeInstanceOf(Exception);
    await expect(provider.collection()).rejects.toBeInstanceOf(Exception);
    expect(MongoProvider.client).toHaveBeenNthCalledWith(1, devs.db);
    expect(MongoProvider.client).toHaveBeenNthCalledWith(2, devs.db);
    expect(client.connect).not.toHaveBeenCalled();
  });

  test('reject if db getter throws exception', async () => {
    jest.spyOn(devs, 'db', 'get').mockImplementation(() => {
      throw Exception.IsNotImplemented;
    });
    provider = new MongoProvider(devs);
    const db = mock.empty<Db>();
    db.collection = mock.resolve({ collectionName: 'devCollection' });
    client.db = mock.resolve(db);
    MongoProvider.client = mock.resolve(client);
    await expect(provider.collection()).rejects.toBeInstanceOf(Exception);
    expect(MongoProvider.client).not.toHaveBeenCalled();
  });
});
