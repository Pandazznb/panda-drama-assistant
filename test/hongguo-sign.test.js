import assert from "node:assert/strict";
import test from "node:test";
import {
  helios,
  sm3,
  ttEncrypt,
  xGorgon,
  __test,
} from "../src/hongguo-sign.js";

const REFERENCE_QUERY =
  "iid=7100000000000012&device_id=7100000000000011&ac=wifi" +
  "&channel=update_64&aid=8662&app_name=novelread" +
  "&version_code=71332&version_name=7.1.3.32" +
  "&device_platform=android&os=android&ssmix=a" +
  "&device_type=25053RT47C&device_brand=Redmi&language=zh" +
  "&os_api=36&os_version=16&manifest_version_code=71332" +
  "&resolution=1280*2772&dpi=520&update_version_code=71332" +
  "&host_abi=arm64-v8a&dragon_device_type=phone&pv_player=71332" +
  "&compliance_status=0&need_personal_recommend=1" +
  "&player_so_load=1&is_android_pad_screen=0" +
  "&ts=1700000000&_rticket=1700000000123";

test("SM3 matches the published abc vector", () => {
  assert.equal(
    sm3(Buffer.from("abc")).toString("hex"),
    "66c7f0f462eeedd9d1f2d46bdc10e4e24167c4875cf2f7a2297da02b8f4ba8e0",
  );
});

test("Gorgon and Helios match the captured app vectors", () => {
  assert.equal(
    xGorgon(
      REFERENCE_QUERY,
      Buffer.from('{"a":1}'),
      1_700_000_000,
      0x1234,
    ),
    "84043412400154ed198c3230d5ff1364e71df6105a46126993c0",
  );
  assert.equal(
    helios(1_700_000_000, 2_028_160_147),
    "k0TjeBWFFnRXfkeKlh3Hmx1jLjrfhgCasqsF4XvB1+0eB1Mw",
  );
});

test("ttEncrypt applies PKCS7 padding exactly once", () => {
  const random = Buffer.from(
    "000102030405060708090a0b0c0d0e0f" +
      "101112131415161718191a1b1c1d1e1f",
    "hex",
  );
  const input = Buffer.alloc(801, 0x61);
  const encrypted = ttEncrypt(input, random);
  const plainLength = 64 + input.length;
  const paddedLength = Math.ceil(plainLength / 16) * 16;

  assert.equal(encrypted.subarray(0, 6).toString("hex"), "746305100000");
  assert.deepEqual(encrypted.subarray(6, 38), random);
  assert.equal(encrypted.length, 38 + paddedLength);
});

test("Medusa key mixing matches the captured app vectors", () => {
  const key = __test.medusaSignKey();
  assert.equal(key.length, 32);
  const [hash, seed] = __test.keyHash(key, 2_378_451_149);
  assert.equal(
    hash.toString("hex"),
    "1b35023431b99a949ab7b70fc50a30216076492a6229d102a7a33fa3a1104170",
  );
  assert.equal(seed.toString("hex"), "b0dff9ff");
  assert.equal(
    __test.xmxor(Buffer.from("0123456789abcdefghij"), hash).toString("hex"),
    "5c69c37694106e8cbdb2e074619a1dda6c5a5a65",
  );
});

test("complete Medusa signature matches the captured app vector", () => {
  const signature = __test.assembleMedusa(
    "https://api5-normal-sinfonlineb.fqnovel.com/x/v1?aid=8662" +
      "&device_id=7100000000000011&ts=1700000000",
    Buffer.from('{"a":1}'),
    1_700_000_000,
    "7100000000000011",
    "7.1.3.32",
    {
      envLaunch: 103,
      envPid: 11_691,
      nowSecs: 1_700_000_000,
      messageRandom: 1_273_073_252,
      random: 2_378_451_149,
      packedRandom: 2_253_366_658,
    },
  );
  assert.equal(
    signature,
    "A/FTZfcZDJ/XJo9e1tubFVc+Mn3NSAABthXCoU+OAdYPONbwm9+RyUZ1cbOs05Yl1aeIPCOGtW+GK2b4gMoFqK69oa1CtJNpHvFQ90KOznW75N3Iac3SIC2SIL/AEUa1LqRKHJc0OVAOzCUSF1PpwjNvKQMxteguS4MtQqRWQiRv25xZVCxPuR4K155Yu2XGsfoblNT6sUx3M9mDqh8WhMpoRbPjSwAij42sVoYMhYUMcyYL73j0agwgsSu/bMNgpLXppp9Hd7KwpiRPFCyDMGP892DPSagFV+ndwVa0M9GGxB3ksAgAUUr91XV5uEUA6/MJpv7AUUEpFfk101bKFHLmflVjL4B9K4OEos6OgkIx2gloIAOULcEBroYDODhlyRqqKT7TX53G09xaFF/YpqtuOC6ZkfG6MOBtYCrCeqgLtoubTaE/xh0VOVRVS/mQWvXYhS00Tqcb/ywQaQzDm1eBAxc1SgDLnzwzLAPLrmDI4rDLqaAWcL6yhsqXydzBShsdZOwreQE9pHzhm3Kaw1ZdV/FLHMqIKnuGoGOOAv19acvxPext43+ckznl5fV5pIj1txHIxcgg8/fQMx0xYM9ubLBnL3lZr+x7226u1kUngjM/IFDSCsVcs3QRzyjAGo+2SWLa8Sicyiq1QsQB5Xw0KWMNlA7lA8dRmxrs2ANytt9GeELT6TZqAWwwoCRbae6aXm+j2qgybmCrmffHBE3gZWgQ8pTjpWWRedesWrwwfioLmyWqRmZRl9TgaWiJpFQZwLFz9WnDhbk8/rFeQjtPH+/my02pcdEXl2Onwwg7/iS5nhWwmKn/k378VIdufE0rFeIAKs9npH8SwAuxaT0GEiWv0AZuXppB6clslZlunKcJHHZK2g/UtbSWEodVLcYPhnFt7cZe46GeFxdSUxNb26BpkjTtwLQGqVFFlFqGb5ijjxz6BVEBpXbZVpLW0+OKFDlfKj166UTiQdk4GfWp28mwvGYFiVqlBOew//nfsP/4n8SN",
  );
});
