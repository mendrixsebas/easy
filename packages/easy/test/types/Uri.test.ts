import { asString, ctx, DateTime, DotEnvContext, EasyUri, EnvContext, Id, OneOrMore, uri, Uri } from '../../src';
import { DevUri } from '../ref';
import '@thisisagile/easy-test';
import { host } from '../../../../test/init';
import { mock } from '@thisisagile/easy-test';

const externalHost = 'https://www.external.com';

class ExternalUri extends EasyUri {
  static readonly api = uri.segment('api');
  readonly host = uri.host(externalHost);
  readonly resource = uri.segment();

  static get Api(): ExternalUri {
    return new ExternalUri([ExternalUri.api]);
  }
}

describe('Uri', () => {
  const withHost = `${host}/dev/developers`;

  beforeEach(() => {
    ctx.env = new DotEnvContext();
  });

  test('Host with context.', () => {
    expect(uri.host().segment).toBe(host);
  });

  test('Returns correct type', () => {
    expect(DevUri.Developers).toBeInstanceOf(DevUri);
  });

  test('returns full route', () => {
    expect(DevUri.Developers).toMatchRoute(withHost);
    expect(DevUri.Developer).toMatchRoute(`${host}/dev/developers/:id`);
  });

  test('isInternal', () => {
    expect(ExternalUri.Api.host.segment).toBe(externalHost);
    expect(ExternalUri.Api.isInternal).toBeFalsy();
    expect(DevUri.Developers.isInternal).toBeTruthy();
  });

  test('isInternal works on default host', () => {
    ctx.env = mock.empty<EnvContext>({ host: undefined });
    expect(ExternalUri.Api.isInternal).toBeFalsy();
    expect(DevUri.Developers.isInternal).toBeTruthy();
  });

  test('path returns path', () => {
    expect(DevUri.Developers.path).toBe('/dev/developers');
  });

  test('route returns just route', () => {
    expect(DevUri.Developers.route()).toBe('/dev/developers');
    expect(DevUri.Developer.route()).toBe('/dev/developers/:id');
  });

  test('complete returns just route', () => {
    expect(DevUri.Developers.complete).toBe(withHost);
    expect(DevUri.Developer.complete).toBe(`${host}/dev/developers/:id`);
  });

  test('returns full route plus id', () => {
    expect(asString(0)).toBe('0');
    expect(DevUri.Developers.id(42)).toMatchRoute(withHost);
    expect(DevUri.Developer.id(42).id(43)).toMatchRoute(`${host}/dev/developers/43`);
    expect(DevUri.Developer.id(0)).toMatchRoute(`${host}/dev/developers/0`);
    expect(DevUri.Developers.level(3)).toMatchRoute(`${host}/dev/developers?level=3`);
    expect(DevUri.Developers.level(0)).toMatchRoute(`${host}/dev/developers?level=0`);
  });

  test('return with ids', () => {
    expect(DevUri.Developers.ids(42)).toMatchRoute(`${host}/dev/developers?ids=42`);
    expect(DevUri.Developers.ids([42, 43])).toMatchRoute(`${host}/dev/developers?ids=42,43`);
  });

  test('returns ok when query parameter is undefined', () => {
    expect(DevUri.Developers.language('Java')).toMatchRoute(`${host}/dev/developers?language=Java`);
    expect(DevUri.Developers.language()).toMatchRoute(`${host}/dev/developers`);
    expect(DevUri.Developers.level(3).language()).toMatchRoute(`${host}/dev/developers?level=3`);
    expect(DevUri.Developers.language().level(3)).toMatchRoute(`${host}/dev/developers?level=3`);
  });

  test('returns full route plus id and a query', () => {
    expect(DevUri.Developers.query('yes')).toMatchRoute(`${host}/dev/developers?q=yes`);
    expect(DevUri.Developer.id(42).query('yes')).toMatchRoute(`${host}/dev/developers/42?q=yes`);
  });

  test('returns full route plus id and a query and sort', () => {
    expect(DevUri.Developers.query('yes').sort('name-asc')).toMatchRoute(`${host}/dev/developers?q=yes&s=name-asc`);
    expect(DevUri.Developer.id(42).query('yes').sort('name-desc')).toMatchRoute(`${host}/dev/developers/42?q=yes&s=name-desc`);
  });

  test('returns full route plus id and two queries', () => {
    expect(DevUri.Developers.query('yes').language('Java')).toMatchRoute(`${host}/dev/developers?q=yes&language=Java`);
    expect(DevUri.Developer.id(42).query('yes').language('C')).toMatchRoute(`${host}/dev/developers/42?q=yes&language=C`);
  });

  test('toString returns full route with query', () => {
    expect(DevUri.Developers.query('yes').language('Java').toString()).toBe(`${host}/dev/developers?q=yes&language=Java`);
    expect(DevUri.Developer.id(42).query('yes').language('C').toString()).toBe(`${host}/dev/developers/42?q=yes&language=C`);
  });

  test('returning with "boolean" query params', () => {
    expect(DevUri.Developers.query('yes').certified().language('Java').toString()).toBe(`${host}/dev/developers?q=yes&certified&language=Java`);
  });

  test('toString with an undefined resource', () => {
    expect(ExternalUri.Api).toMatchText(`https://www.external.com/api`);
  });

  test('Route with empty startIndex and itemsPerPage queries', () => {
    expect(DevUri.Developers.skip().take()).toMatchRoute(`${host}/dev/developers`);
  });

  test('Route with undefined startIndex and itemsPerPage queries', () => {
    expect(DevUri.Developers.skip(undefined).take(undefined)).toMatchRoute(`${host}/dev/developers`);
  });

  test('Route with skip and take queries', () => {
    expect(DevUri.Developers.skip(20).take(10)).toMatchRoute(`${host}/dev/developers?skip=20&take=10`);
  });

  test('Route with q and skip and take queries', () => {
    expect(DevUri.Developers.query('test').skip(0).take(10)).toMatchRoute(`${host}/dev/developers?q=test&skip=0&take=10`);
  });

  const baseUri = 'https://www.easy.io/dev/developers';
  test('Expand with empty options', () => {
    const u = DevUri.Developers.expand({});
    expect(u).toMatchText(baseUri);
  });

  test('Expand with undefined value', () => {
    const u = DevUri.Developers.expand({ q: undefined });
    expect(u).toMatchText(baseUri);
  });

  test('Expand with empty value', () => {
    const u = DevUri.Developers.expand({ q: '' });
    expect(u).toMatchText(baseUri);
  });

  test('Expand with default options', () => {
    const u = DevUri.Developers.expand({ q: 'sander' });
    expect(u).toMatchText('https://www.easy.io/dev/developers?q=sander');
  });

  type DevProps = { live: boolean; startDate: DateTime; brands: OneOrMore<Id> };

  class PropsDevUri extends EasyUri<DevProps> {
    static readonly devs = uri.segment('developers');
    readonly resource = uri.segment('dev');

    static get Developers(): PropsDevUri {
      return new PropsDevUri([DevUri.devs]);
    }
  }

  test('Expand with simple true option', () => {
    const u = PropsDevUri.Developers.expand({ live: true });
    expect(u).toMatchText('https://www.easy.io/dev/developers?live');
  });

  test('Expand with simple false option', () => {
    const u = PropsDevUri.Developers.expand({ live: false });
    expect(u).toMatchText(baseUri);
  });

  test('Expand with simple datetime option', () => {
    const u = PropsDevUri.Developers.expand({ startDate: new DateTime(1621347575) });
    expect(u).toMatchText('https://www.easy.io/dev/developers?startDate=1970-01-19T18:22:27.575Z');
  });

  test('Expand with simple array option', () => {
    const u = PropsDevUri.Developers.expand({ brands: '42' });
    expect(u).toMatchText('https://www.easy.io/dev/developers?brands=42');
  });

  test('Expand with multiple array option', () => {
    const u = PropsDevUri.Developers.expand({ brands: ['42', '43'] });
    expect(u).toMatchText('https://www.easy.io/dev/developers?brands=42,43');
  });

  test('Expand with multiple options', () => {
    const u = PropsDevUri.Developers.expand({ live: true, brands: ['42', '43'] });
    expect(u).toMatchText('https://www.easy.io/dev/developers?live&brands=42,43');
  });
});
