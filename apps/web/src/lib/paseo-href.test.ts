import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { handlePaseoAnchorClick, isPaseoHref } from './paseo-href';

describe('isPaseoHref', () => {
  it('accepts the agent deep-link scheme', () => {
    assert.equal(isPaseoHref('paseo://h/srv_abc/agent/11111111-2222-3333-4444-555555555555'), true);
    assert.equal(isPaseoHref('PASEO://h/x/agent/y'), true);
  });

  it('rejects http(s) and missing hrefs', () => {
    assert.equal(isPaseoHref('https://example.com'), false);
    assert.equal(isPaseoHref('/project/PASEO/issue/8'), false);
    assert.equal(isPaseoHref(''), false);
    assert.equal(isPaseoHref(null), false);
  });
});

describe('handlePaseoAnchorClick', () => {
  function click(href: string | null, button = 0) {
    const assigned: string[] = [];
    const anchor = {
      getAttribute(name: string) {
        return name === 'href' ? href : null;
      },
    };
    const event = {
      button,
      target: {
        closest(selector: string) {
          return selector === 'a' ? anchor : null;
        },
      },
      prevented: false,
      preventDefault() {
        this.prevented = true;
      },
    };
    const handled = handlePaseoAnchorClick(event, (url) => assigned.push(url));
    return { handled, assigned, prevented: event.prevented };
  }

  it('assigns a paseo:// href on the current window and prevents _blank', () => {
    const href = 'paseo://h/srv_x/agent/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    const result = click(href);
    assert.equal(result.handled, true);
    assert.equal(result.prevented, true);
    assert.deepEqual(result.assigned, [href]);
  });

  it('leaves http(s) links to the browser', () => {
    const result = click('https://example.com/doc');
    assert.equal(result.handled, false);
    assert.equal(result.prevented, false);
    assert.deepEqual(result.assigned, []);
  });

  it('ignores non-primary clicks', () => {
    const result = click('paseo://h/srv_x/agent/y', 1);
    assert.equal(result.handled, false);
    assert.deepEqual(result.assigned, []);
  });
});
