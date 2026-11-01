import crypto from "node:crypto";
import { gzipSync } from "node:zlib";

const APP_ID = "8662";
const APP_NAME = "novelread";
const CHANNEL_ID = "1588093228";
const VERSION_NAME = "7.3.9.32";
const VERSION_CODE = "73932";
const GORGON_SDK_VERSION = 67503104;
const DEVICE_API_ORIGIN = "https://api5-normal-sinfonlinea.fqnovel.com";
const MEDUSA_URL_ORIGIN = "https://reading.snssdk.com";

const DEVICE = Object.freeze({
  ac: "wifi",
  channel: "xiaomi_8662_64",
  aid: APP_ID,
  app_name: APP_NAME,
  version_code: VERSION_CODE,
  version_name: VERSION_NAME,
  device_platform: "android",
  os: "android",
  ssmix: "a",
  device_type: "23127PN0CC",
  device_brand: "Xiaomi",
  language: "zh",
  os_api: "34",
  os_version: "14",
  manifest_version_code: VERSION_CODE,
  resolution: "1200*2670",
  dpi: "460",
  update_version_code: VERSION_CODE,
  host_abi: "arm64-v8a",
  dragon_device_type: "phone",
  pv_player: VERSION_CODE,
  compliance_status: "0",
  need_personal_recommend: "1",
  player_so_load: "1",
  is_android_pad_screen: "0",
});

const ACCOUNT_DEVICE = Object.freeze({
  ...DEVICE,
  channel: "update_64",
  device_type: "25053RT47C",
  device_brand: "Redmi",
  os_api: "36",
  os_version: "16",
  resolution: "1280*2772",
  dpi: "520",
});

const BRANCH2_SV = [
  0xa7aefe20, 0x7149f1d6, 0x47e4ca07, 0xe9b58f67,
  0x93b924de, 0xc614d0f5, 0x38afe0ef, 0xb2bbad73,
  0xe24444c3, 0x9d3aec9b, 0xdf7b37e4, 0xd8b16d40,
  0xf8ac31b8, 0x76b9a90b, 0x31d833ee, 0x953fce64,
  0x353595a4, 0x4609c13b, 0x36925008, 0x8c6d0925,
  0x5df5c177, 0x1cfbf52b, 0x8a4fa7f0, 0x114ca35e,
  0x8193f984, 0x7a7a8733, 0x316ab4d5, 0x3c20cfc9,
  0xa6d84453, 0x3a18500c, 0x798ec47a, 0x97a76b28,
  0x66c4ff96, 0x51716443, 0x0dd2fc3b, 0xb5696da7,
  0xbbeb3ac5, 0x5c53d204, 0xd32608ce, 0x7279b9ec,
  0xf4188ecf, 0xf7d793db, 0x332cc491, 0xab76ae15,
  0x9bebe727, 0x18a01384, 0x5be9f8a7, 0x5f90a754,
  0x39b663c0, 0x36673c83, 0x7c92f514, 0x9d7d94d7,
  0xe2e8d9aa, 0x5f7e9ea9, 0x7abd4551, 0x569e05da,
  0x40a25632, 0x3df5a9a5, 0xbab37d80, 0x454286dc,
  0x3f5d4e78, 0x03d7b75d, 0xb1fe4af7, 0xa5ab26a3,
];

const BRANCH2_ORDERS = Buffer.from(
  "0f0704000908030a060b050d0e010c020f05080c0009020103070e060b0a0d04060500070c000a04080f010b0d09020e060b02050403080101070a000d0c090e0d070e0f0b0208030c0509010004060a0d0902060f0b0a040807000c0503010e0c090f07060f030e020d0405010b0a000c050a090e0802040407030f01060b000b0f0408020a0700090d06010e03050c0b060a0508020c03070f0e090d0001040906080f050800040a0b030d01020c0e090d0c0604070a03030f00080105020e01000d0f090a0b0e0402080703060c0501080a0c0f0905060b000304020e070d04080f000c0f0e0d0a01060207090503040205080d0b0a0606000e0f070c09030a08040f000b01060d0c0709030e05020a070b050f00020e0108030d0c0609040d070f08050f06040b0a0e0c090002030d0c020704010b0e0e08060f09050003",
  "hex",
);

const BRANCH0_IV = [
  0xc4a78580, 0xb3c0fd39, 0xc58c5686,
  0xc9aa3ba7, 0xf5a7adf2, 0x963c2ed1,
];

const BRANCH0_TT = [
  0xebb64faf, 0x07aadcc2, 0xcf3187bf, 0xe01138ff,
  0x6d0bfcff, 0x5a30a3be, 0xb41ad638, 0x34180eb8,
  0xf233eb6f, 0xb1a584cc, 0xccc30dc7, 0x47d1db51,
  0xd55653de, 0x70a84fa1, 0x57473c12, 0xf76f0288,
  0x2c077f0a, 0xda0dcad0, 0xfbb86f6c, 0xfdc4cf00,
  0x688a020d, 0xe676c6a6, 0x8cd6338b, 0x1a3c8d0e,
  0xcce8b06b, 0x6ad0ed0b, 0xa0522717, 0xdc71ac83,
  0x2285db71, 0xd5b4dda6, 0x736f8650, 0x6560306c,
  0x617ce2a6, 0xe423417e, 0x0a40e143, 0x544e4032,
  0x88dffb2a, 0x716c1ae0, 0x4c467a88, 0x05b23bb3,
  0xe1d0b866, 0xbaa3dcb8, 0xae3374d3, 0xc3381a50,
  0x1702f75b, 0xfe6da368, 0xf0b4cf48, 0x4e0ffbb8,
  0x72aad10d, 0x26c53a3d, 0xf2bce0f6, 0xb4557581,
  0x4a257fdd, 0x8c3182a2, 0xab0b3b86, 0x3d5dfb14,
  0x4f103634, 0xd37b52d7, 0x444eff16, 0xeb0a33d1,
  0x6ca86f6e, 0x00284ba7, 0x08387cfa, 0x5fb37586,
];

const BRANCH0_INIT = [
  0x7aba4fc8, 0x67166507, 0x6403fa00, 0x340f512f,
  984304912, 3005047866, 2874125293, 2152413264,
];

const BRANCH0_ROUNDS = [
  [101, 5, 7, 6, 3, 2, 1, 0, 5, 4, 3],
  [96, 0, 6, 7, 5, 3, 2, 1, 5, 4, 4],
  [96, 7, 6, 2, 1, 4, 0, 5, 4, 3, 5],
  [99, 3, 6, 2, 4, 5, 1, 0, 0, 7, 6],
  [96, 0, 5, 6, 7, 3, 1, 2, 5, 4, 4],
  [100, 2, 0, 3, 5, 4, 6, 7, 2, 1, 5],
];

const AES_CON2 = [
  [1, 0, 2, 3],
  [2, 0, 3, 1],
  [0, 1, 3, 2],
  [1, 0, 2, 3],
];

const AES_ORDER = [
  [0, 9, 14, 11, 4, 13, 2, 7, 8, 1, 6, 15, 12, 5, 10, 3],
  [0, 9, 14, 15, 4, 13, 2, 7, 8, 1, 6, 3, 12, 5, 10, 11],
  [0, 9, 14, 7, 4, 13, 2, 11, 8, 1, 6, 3, 12, 5, 10, 15],
  [0, 9, 14, 11, 4, 13, 2, 7, 8, 1, 6, 15, 12, 5, 10, 3],
];

const AES_INIT_WORD = [0xca025ddc, 0x823dc546, 0xc9420583, 0xc298225f];

const SBOX = Buffer.from(
  "+n0Ia5xZs0sEXznQOEqRmQBnpiCf9U2Ccybu3xhmgzOAAxn72f6uqqmwUsYL83klTni0NqxdGieeiNu9PGPsSRXBMB/cuFbUbM3KCUPINaPvHvSW0vwOcnuUhNHqRVpiAj/TEoE0K91+5ijypUYTATsh9mE3KSoN7Yyvv51cuyR2D3XkU4nhmI2xmmVwT1RMWKtub4sjxAcRDLrPoKSO2AU9FLLadMPX577Wf95IFj6FkKFVt3dCIsmGUC4X+WQxLJvxbRxEaOPpqJOXyzJX6+Vxaq3AzMfF/WAdoi1Hp+JRaV56zgpBtpWP97mH4DoGEIq1+FvV8LyS/3wvwugbQOwb2r26mJEMsiuDQTRn+wrYdrVGBVlhI3WQhyrjUBVMrLF5667llUcEaPCGPVGLD8qO5LlO8hKCvA7V9+8oJc9bXelqVQLhM76T5/WtnT45JKji+hdX0HoNCDDWuKON/QeaxB5uImSX0h2wv0VmP2zd2yeApxHcpsVS+MC2yFwAc2B7oBkTqsk1SEvTpM2fmfMQREBUfin0Bh+iq6EvPPavhWI2IX9e3yAas7Tm/3KEj2UmlFp36kN4x0rMLBRrxuh0U/zUHM4xcAMYjJY4MonxOl/X+alpt2M3WMI7w3HLnpIBigtNiJu7T21v4P6lSd5WFgntnMEt7oF92XzRLkJbTcGmXepE/UVOG6E/0YnhfS+q26utWcuxzpooyeD2cDlK1/8w9d28VzsRjbLuALbmGlp8+d7EzS6Au7lMpZ+ECMZvQmzwJ+eLOpxR+2chdUExp8ogQyq3v9l68rX4jCwjg0+PYKAEEzcU4wHFY2ZcdIHfWL1okD3SszT0GZMyKdZJrg1L2AeerB4tC0C4crp2EHGo5FYdSP7lwkeR2ocmnR+Ia8CYviUJlzOjhRZef9xuVOn3qcjow3fQgivsAmKKkg4+sA8F8/GWeDiGNhg8JM8KtFPMYWWkx5TVFX5t73kiNRJqjlIGVXtGZFCV4gzt0xcDopuZ6xz8r9Rzafpf9ywev8jh8592gHFIqpStZPuJxmDDMrNN0uBE3V+oscdoIzTJbRJ/t+sVvqnReJOgDJKk10fjisJwqyZBmnmn2BSFj8BvVtCMEbkuPOKdzw7eA11GPs04Qw8zWtkaZWwiO/wwpojqN6K0jY5RnNZA7vn4hPSul+nKCkVnVwQvg1zVxcSCtqORmB9KrJaBbssbCQivGJVJfVTt+hYxOtq4ZvWl8f4QAQZ0zGPffCgl9s6yT4vlvIdpu4YhBwA25wtQWZsc6GJYGWHyvSdeuh3mmUI9DSq13Fsp8C1MU3tqc04/df9LoTUXVXI5INOw/e8C7Hd+5CvbkMEFnnrUUmskEw==",
  "base64",
);

function u32(value) {
  return Number(value) >>> 0;
}

function rol32(value, count) {
  const shift = count & 31;
  const number = u32(value);
  return shift === 0
    ? number
    : u32((number << shift) | (number >>> (32 - shift)));
}

function ror32(value, count) {
  const shift = count & 31;
  const number = u32(value);
  return shift === 0
    ? number
    : u32((number >>> shift) | (number << (32 - shift)));
}

function ror64(value, count) {
  const shift = BigInt(count) & 63n;
  const number = BigInt.asUintN(64, BigInt(value));
  return shift === 0n
    ? number
    : BigInt.asUintN(64, (number >> shift) | (number << (64n - shift)));
}

function reverseBits(value) {
  let result = 0;
  for (let index = 0; index < 8; index += 1) {
    result = (result << 1) | ((value >> index) & 1);
  }
  return result & 0xff;
}

function le32(value) {
  const output = Buffer.alloc(4);
  output.writeUInt32LE(u32(value));
  return output;
}

function be32(value) {
  const output = Buffer.alloc(4);
  output.writeUInt32BE(u32(value));
  return output;
}

function md5(value) {
  return crypto.createHash("md5").update(value).digest();
}

function getIv(initial, data) {
  let value = u32(initial);
  for (let index = 0; index < data.length; index += 1) {
    if ((index & 1) === 0) {
      value = u32(
        (value >>> 4) ^ value ^ (value << 6) ^ data[index],
      );
    } else {
      value = u32(
        ~((value >>> 7) ^ value ^ (data[index] | (value << 12))),
      );
    }
  }
  return value;
}

function sumMd5(data) {
  let check = 0x20220420;
  for (let index = 0; index < 12; index += 1) {
    let temporary;
    if ((index & 1) === 0) {
      temporary = (check >>> 3) ^ check;
      check = data[index] ^ (check << 7);
    } else {
      temporary = (check >>> 5) ^ check;
      check = data[index] | (check << 11);
      check = ~check;
    }
    check = u32(check ^ temporary);
  }
  return u32((check | 4) ^ 0x01000000);
}

export function sm3(input) {
  const message = Buffer.from(input);
  const hash = [
    0x7380166f, 0x4914b2b9, 0x172442d7, 0xda8a0600,
    0xa96f30bc, 0x163138aa, 0xe38dee4d, 0xb0fb0e4e,
  ];
  const bitLength = BigInt(message.length) * 8n;
  const paddedLength = Math.ceil((message.length + 9) / 64) * 64;
  const padded = Buffer.alloc(paddedLength);
  message.copy(padded);
  padded[message.length] = 0x80;
  padded.writeBigUInt64BE(bitLength, paddedLength - 8);

  const words = new Uint32Array(68);
  const expanded = new Uint32Array(64);
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      words[index] = padded.readUInt32BE(offset + index * 4);
    }
    for (let index = 16; index < 68; index += 1) {
      const value =
        words[index - 16] ^
        words[index - 9] ^
        rol32(words[index - 3], 15);
      const p1 =
        value ^
        rol32(value, 15) ^
        rol32(value, 23);
      words[index] = u32(
        p1 ^ rol32(words[index - 13], 7) ^ words[index - 6],
      );
    }
    for (let index = 0; index < 64; index += 1) {
      expanded[index] = words[index] ^ words[index + 4];
    }

    let [a, b, c, d, e, f, g, h] = hash;
    for (let index = 0; index < 64; index += 1) {
      const constant = index < 16 ? 0x79cc4519 : 0x7a879d8a;
      const ss1 = rol32(
        u32(rol32(a, 12) + e + rol32(constant, index)),
        7,
      );
      const ss2 = ss1 ^ rol32(a, 12);
      const ff =
        index < 16 ? a ^ b ^ c : (a & b) | (a & c) | (b & c);
      const gg =
        index < 16 ? e ^ f ^ g : (e & f) | (~e & g);
      const tt1 = u32(ff + d + ss2 + expanded[index]);
      const tt2 = u32(gg + h + ss1 + words[index]);
      d = c;
      c = rol32(b, 9);
      b = a;
      a = tt1;
      h = g;
      g = rol32(f, 19);
      f = e;
      e = u32(tt2 ^ rol32(tt2, 9) ^ rol32(tt2, 17));
    }
    hash[0] = u32(hash[0] ^ a);
    hash[1] = u32(hash[1] ^ b);
    hash[2] = u32(hash[2] ^ c);
    hash[3] = u32(hash[3] ^ d);
    hash[4] = u32(hash[4] ^ e);
    hash[5] = u32(hash[5] ^ f);
    hash[6] = u32(hash[6] ^ g);
    hash[7] = u32(hash[7] ^ h);
  }
  const output = Buffer.alloc(32);
  hash.forEach((value, index) => output.writeUInt32BE(value, index * 4));
  return output;
}

function rc4Gorgon(data, key) {
  const state = Array.from({ length: 256 }, (_, index) => index);
  let j = 0;
  for (let index = 0; index < 256; index += 1) {
    j = (j + state[index] + key[index % key.length]) & 0xff;
    state[index] = state[j];
  }
  let i = 0;
  j = 0;
  const output = Buffer.alloc(data.length);
  for (let index = 0; index < data.length; index += 1) {
    i = (i + 1) & 0xff;
    const x = state[i];
    j = (j + x) & 0xff;
    const y = state[j];
    state[i] = y;
    output[index] = data[index] ^ state[(y + y) & 0xff];
  }
  return output;
}

export function xGorgon(query, body, khronos, random) {
  const input = Buffer.concat([
    md5(Buffer.from(query)).subarray(0, 4),
    body ? md5(body).subarray(0, 4) : Buffer.alloc(4),
    Buffer.alloc(4),
    le32(GORGON_SDK_VERSION),
    be32(khronos),
  ]);
  const key = Buffer.from([
    0x4a,
    0x40,
    0x16,
    (random >> 8) & 0xff,
    0x47,
    0x6c,
    0x01,
    random & 0xff,
  ]);
  const transformed = rc4Gorgon(input, key);
  for (let index = 0; index < transformed.length; index += 1) {
    const value = (transformed[index] >> 4) | (transformed[index] << 4);
    const next =
      index + 1 < transformed.length
        ? transformed[index + 1]
        : transformed[0];
    transformed[index] =
      ~(reverseBits((next ^ value) & 0xff) ^ 20) & 0xff;
  }
  return Buffer.concat([
    Buffer.from([0x84, 0x04, random & 0xff, (random >> 8) & 0xff, 0x40, 0x01]),
    transformed,
  ]).toString("hex");
}

export function helios(khronos, random) {
  const seed = Buffer.concat([le32(random), Buffer.from(APP_ID)]);
  const digestHex = md5(seed).toString("hex");
  const asciiDigest = Buffer.from(digestHex);
  const words = [];
  for (let index = 0; index < 4; index += 1) {
    words.push(asciiDigest.readBigUInt64LE(index * 8));
  }
  const table = [words[0]];
  let b0 = words[0];
  let b8 = words[1];
  const queue = words.slice(2);
  for (let index = 0n; index < 34n; index += 1n) {
    let generated = BigInt.asUintN(64, ror64(b8, 8n) + b0);
    generated = BigInt.asUintN(64, generated ^ index);
    queue.push(generated);
    generated = BigInt.asUintN(64, generated ^ ror64(b0, 61n));
    table.push(generated);
    b0 = generated;
    b8 = queue.shift();
  }

  const text = Buffer.from(`${khronos}-${CHANNEL_ID}-${APP_ID}`);
  const fill = 16 - (text.length % 16);
  const padded = Buffer.alloc(
    Math.ceil((text.length + 1) / 16) * 16,
    fill,
  );
  text.copy(padded);
  const output = [];
  for (let offset = 0; offset < padded.length; offset += 16) {
    let a = padded.readBigUInt64LE(offset);
    let b = padded.readBigUInt64LE(offset + 8);
    for (let index = 0; index < 34; index += 1) {
      b = BigInt.asUintN(64, table[index] ^ (a + ror64(b, 8n)));
      a = BigInt.asUintN(64, b ^ ror64(a, 61n));
    }
    const block = Buffer.alloc(16);
    block.writeBigUInt64LE(a, 0);
    block.writeBigUInt64LE(b, 8);
    output.push(block);
  }
  return Buffer.concat([le32(random), ...output]).toString("base64");
}

function branchOf(querySm3, bodyMd5, timestamp) {
  const iv = getIv(
    getIv(getIv(0x20230928, querySm3), bodyMd5),
    timestamp,
  );
  const low = iv & 15;
  return low - (((low * 171) >> 9) * 3);
}

function expandWords(data) {
  const words = [];
  for (let offset = 0; offset + 4 <= data.length; offset += 4) {
    words.push(data.readUInt32BE(offset));
  }
  let word0 = words[0];
  for (let index = 0; index < 112; index += 1) {
    const word1 = words[index + 1];
    const word14 = words[index + 14];
    const right1 =
      rol32(word1, 14) ^ rol32(word1, 25) ^ (word1 >>> 3);
    const right2 =
      rol32(word14, 13) ^ rol32(word14, 15) ^ (word14 >>> 10);
    words.push(u32(word0 + words[index + 9] + right1 + right2));
    word0 = word1;
  }
  return words;
}

function branch0F13(querySm3, bodyMd5, timestamp, khronos, variation) {
  const iv = BRANCH0_IV[Math.min(variation, BRANCH0_IV.length - 1)];
  const count1 = (iv + khronos + 1) & 0xff;
  const count2 = u32(iv + khronos);
  const tt = BRANCH0_TT.map((value) => ror32(value, count1));
  const shift = (count2 + 2) & 7;
  const seed = [0xfa, 0x45, 0x61, 0xd7];
  const pad = Buffer.from(
    seed.map((value) => ((value | (value << 8)) >>> shift) & 0xff),
  );
  const data = Buffer.concat([
    querySm3,
    bodyMd5,
    timestamp,
    pad,
    Buffer.from("00000000000001a0", "hex"),
  ]);
  const words = expandWords(data);
  const initial = BRANCH0_INIT.map((value) =>
    ror32(value, count2 & 31),
  );
  const state = [...initial];
  const rounds = BRANCH0_ROUNDS[variation];
  for (let index = 0; index < rounds[0]; index += 1) {
    const base = u32(iv + index);
    const word = words[base & 127];
    const first =
      ((state[rounds[3]] ^ state[rounds[4]]) & state[rounds[1]]) ^
      state[rounds[3]];
    const second =
      rol32(state[rounds[1]], 26) ^
      rol32(state[rounds[1]], 21) ^
      rol32(state[rounds[1]], 7);
    const fourth = u32(
      word +
        first +
        second +
        tt[base & 63] +
        state[rounds[5]],
    );
    const fifth =
      rol32(state[rounds[2]], 30) ^
      rol32(state[rounds[2]], 19) ^
      rol32(state[rounds[2]], 10);
    const sixth =
      (state[rounds[2]] & state[rounds[6]]) |
      ((state[rounds[2]] | state[rounds[6]]) & state[rounds[7]]);
    const seventh = u32(fifth + sixth);
    const old = state[rounds[9]];
    const last = state[state.length - 1];
    state.pop();
    state.unshift(last);
    state[rounds[10]] = u32(seventh + fourth);
    state[rounds[8]] = u32(old + fourth);
  }
  const result = Buffer.alloc(32);
  for (let index = 0; index < 8; index += 1) {
    result.writeUInt32BE(
      u32(state[index] + initial[index]),
      index * 4,
    );
  }
  for (let index = 0; index < 16; index += 1) {
    result[index] ^= result[index + 16];
  }
  return Buffer.concat([
    result.subarray(0, 16),
    le32(sumMd5(result.subarray(0, 16))),
  ]);
}

function md5V3Step(kind, a, b, c, d, message, shift, constant) {
  let value;
  if (kind === 0) {
    value = (b & c) | (~b & d);
  } else if (kind === 1) {
    value = (b & d) | (c & ~d);
  } else if (kind === 2) {
    value = b ^ c ^ d;
  } else {
    value = c ^ (b | ~d);
  }
  return u32(b + rol32(u32(a + value + message + constant), shift));
}

function md5SumV3(message, count2, orders, count1) {
  const values = BRANCH2_SV.map((value) => ror32(value, count1));
  const start = [
    ror32(0x79e0f2fb, count2),
    ror32(0xc8b52570, count2),
    ror32(0xebc2f8cd, count2),
    ror32(0x7c104d93, count2),
  ];
  const endCount = (count2 + 6) & 0xff;
  const end = [
    ror32(0x19be4866, endCount),
    ror32(0xe85986b4, endCount),
    ror32(0xe19b326e, endCount),
    ror32(0x71d1d7d4, endCount),
  ];
  const words = [];
  for (let index = 0; index < 16; index += 1) {
    words.push(message.readUInt32LE(index * 4));
  }
  let [a, b, c, d] = start;
  const run = (kind, shifts, offset) => {
    for (let index = 0; index < 16; index += 1) {
      const phase = index & 3;
      const word = words[orders[offset + index]];
      const constant = values[offset + index];
      const next = md5V3Step(
        kind,
        phase === 0 ? a : phase === 1 ? d : phase === 2 ? c : b,
        phase === 0 ? b : phase === 1 ? a : phase === 2 ? d : c,
        phase === 0 ? c : phase === 1 ? b : phase === 2 ? a : d,
        phase === 0 ? d : phase === 1 ? c : phase === 2 ? b : a,
        word,
        shifts[index],
        constant,
      );
      if (phase === 0) {
        a = next;
      } else if (phase === 1) {
        d = next;
      } else if (phase === 2) {
        c = next;
      } else {
        b = next;
      }
    }
  };
  run(0, [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22], 0);
  run(1, [5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20], 16);
  run(2, [4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23], 32);
  run(3, [6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21], 48);
  const result = Buffer.alloc(20);
  result.writeUInt32LE(u32((start[0] + a) ^ end[0]), 0);
  result.writeUInt32LE(u32((start[1] + b) ^ end[1]), 4);
  result.writeUInt32LE(u32((start[2] + c) ^ end[2]), 8);
  result.writeUInt32LE(u32((start[3] + d) ^ end[3]), 12);
  result.writeUInt32LE(sumMd5(result.subarray(0, 16)), 16);
  return result;
}

function branch2F13(iv, querySm3, bodyMd5, timestamp, khronos) {
  const value = (iv & 13) * 86;
  const variation = ((value >>> 15) & 0xff) + ((value >>> 8) & 0xff);
  const constants = [
    0x8980f29b,
    0xeb549c7f,
    0xb08726db,
    0xd40cb5e6,
    0xe8f559e4,
  ];
  const constant = constants[Math.min(variation, constants.length - 1)];
  const count1 = (constant + khronos + 1) & 0xff;
  const count2 = u32(constant + khronos);
  const shift = (count2 + 5) & 7;
  const seed = [0x84, 0x96, 0x77, 0x9d, 0xd4, 0x15, 0x0b, 0xf8];
  const pad = Buffer.from(
    seed.map((value) => ((value | (value << 8)) >>> shift) & 0xff),
  );
  const input = Buffer.concat([
    querySm3,
    bodyMd5,
    timestamp,
    pad,
    Buffer.from("a0010000", "hex"),
  ]);
  const begin = variation << 6;
  return md5SumV3(
    input,
    count2,
    BRANCH2_ORDERS.subarray(begin, begin + 64),
    count1,
  );
}

function hashF13(querySm3, bodyMd5, timestamp, khronos) {
  const iv = getIv(
    getIv(getIv(0x20230928, querySm3), bodyMd5),
    timestamp,
  );
  const low = iv & 15;
  const variation = (low * 171) >> 9;
  const branch = low - variation * 3;
  if (branch === 2) {
    return branch2F13(iv, querySm3, bodyMd5, timestamp, khronos);
  }
  if (branch !== 0) {
    return Buffer.concat([
      querySm3.subarray(0, 16),
      bodyMd5,
      le32(sumMd5(Buffer.concat([querySm3, bodyMd5]))),
    ]);
  }
  return branch0F13(querySm3, bodyMd5, timestamp, khronos, variation);
}

function xorBytes(left, right) {
  const output = Buffer.from(left);
  for (let index = 0; index < output.length; index += 1) {
    output[index] ^= right[index % right.length];
  }
  return output;
}

class AesV3 {
  constructor(key, khronos) {
    this.word = khronos & 3;
    this.box = SBOX.subarray(this.word * 256, (this.word + 1) * 256);
    this.con2 = AES_CON2[this.word];
    this.order = AES_ORDER[this.word];
    this.keys = this.expand(key);
  }

  expand(key) {
    const initialWord = AES_INIT_WORD[this.word];
    const initial = Buffer.alloc(16);
    for (let index = 0; index < 4; index += 1) {
      initial.writeUInt32LE(initialWord, index * 4);
    }
    const expanded = Buffer.concat([xorBytes(initial, key), Buffer.alloc(32)]);
    let rounds = 8;
    for (let index = 4; index < 12; index += 1) {
      const offset = 4 * (index - 1);
      let a = expanded[offset];
      let b = expanded[offset + 1];
      let c = expanded[offset + 2];
      let d = expanded[offset + 3];
      if ((index & 3) === 0) {
        const temporary =
          (u32(initialWord >>> (rounds & 24)) ^ this.box[b]) & 0xff;
        b = this.box[c];
        c = this.box[d];
        d = this.box[a];
        a = temporary;
      }
      rounds += 2;
      expanded[offset + 4] = a ^ expanded[offset - 12];
      expanded[offset + 5] = b ^ expanded[offset - 11];
      expanded[offset + 6] = c ^ expanded[offset - 10];
      expanded[offset + 7] = d ^ expanded[offset - 9];
    }
    return Array.from({ length: 12 }, (_, index) =>
      Array.from(expanded.subarray(index * 4, index * 4 + 4)),
    );
  }

  addCon(state, keys) {
    for (let row = 0; row < 4; row += 1) {
      for (let column = 0; column < 4; column += 1) {
        state[row][column] ^= keys[row][this.con2[column]];
      }
    }
  }

  substitute(state) {
    for (let row = 0; row < 4; row += 1) {
      for (let column = 0; column < 4; column += 1) {
        state[row][column] = this.box[state[row][column]];
      }
    }
    const old = state.map((row) => [...row]);
    for (let row = 0; row < 4; row += 1) {
      state[row] = [...old[this.con2[row]]];
    }
  }

  shift(state) {
    const flat = state.flat();
    for (let index = 0; index < 16; index += 1) {
      state[Math.floor(index / 4)][index % 4] = flat[this.order[index]];
    }
  }

  shiftCon(state) {
    const old = state.map((row) => [...row]);
    for (let row = 0; row < 4; row += 1) {
      for (let column = 0; column < 4; column += 1) {
        state[row][column] = old[row][this.con2[column]];
      }
    }
  }

  block(value) {
    const state = Array.from({ length: 4 }, (_, row) =>
      Array.from(value.subarray(row * 4, row * 4 + 4)),
    );
    this.addCon(state, this.keys.slice(0, 4));
    for (let round = 1; round < 3; round += 1) {
      this.substitute(state);
      this.shift(state);
      if (round === 1) {
        this.shiftCon(state);
        mixColumns(state);
      }
      this.addCon(state, this.keys.slice(round * 4, round * 4 + 4));
    }
    for (let row = 0; row < 4; row += 1) {
      for (let column = 0; column < 4; column += 1) {
        state[row][column] ^= this.keys[4 + row][column];
      }
    }
    return Buffer.from(state.flat());
  }

  encrypt(data, iv) {
    const source = Buffer.from(data);
    const plaintext = Buffer.alloc(32);
    for (let index = 0; index < 31; index += 1) {
      const offset = index * 8;
      const n0 = (source[offset] >> 4) & 2;
      const n1 = n0 | (source[offset + 1] & 64);
      const n2 = n1 | ((source[offset + 2] >> 2) & 1);
      const n3 = n2 | ((source[offset + 3] << 3) & 128);
      const n4 = n3 | ((source[offset + 4] >> 1) & 4);
      const n5 = n4 | ((source[offset + 5] << 3) & 16);
      const n6 = n5 | ((source[offset + 6] << 5) & 32);
      plaintext[index] = n6 | ((source[offset + 7] >> 4) & 8);
    }
    plaintext[31] = 1;
    const blocks = [];
    let previous = Buffer.from(iv);
    for (let offset = 0; offset < 32; offset += 16) {
      const block = this.block(
        xorBytes(plaintext.subarray(offset, offset + 16), previous),
      );
      blocks.push(block);
      previous = block;
    }
    const key = Buffer.concat(blocks);
    const output = Buffer.from(source);
    for (let index = 0; index < 31; index += 1) {
      const offset = index * 8;
      const value = key[index];
      output[offset] = (output[offset] & 0xdf) | ((value << 4) & 32);
      output[offset + 1] = (output[offset + 1] & 0xbf) | (value & 64);
      output[offset + 2] =
        (output[offset + 2] & 0xfb) | ((value << 2) & 4);
      output[offset + 3] =
        (output[offset + 3] & 0xef) | ((value >> 3) & 16);
      output[offset + 4] =
        (output[offset + 4] & 0xf7) | ((value + value) & 8);
      output[offset + 5] =
        (output[offset + 5] & 0xfd) | ((value >> 3) & 2);
      output[offset + 6] =
        (output[offset + 6] & 0xfe) | ((value >> 5) & 1);
      output[offset + 7] =
        (output[offset + 7] & 0x7f) | ((value << 4) & 128);
    }
    return Buffer.concat([key.subarray(31), output]);
  }
}

function mixColumns(state) {
  const multiply = (value) =>
    ((value << 1) ^ (value & 128 ? 0x1b : 0)) & 0xff;
  for (let column = 0; column < 4; column += 1) {
    const total =
      state[0][column] ^
      state[1][column] ^
      state[2][column] ^
      state[3][column];
    const first = state[0][column];
    state[0][column] ^=
      total ^ multiply(state[0][column] ^ state[1][column]);
    state[1][column] ^=
      total ^ multiply(state[1][column] ^ state[2][column]);
    state[2][column] ^=
      total ^ multiply(state[2][column] ^ state[3][column]);
    state[3][column] ^= total ^ multiply(state[3][column] ^ first);
  }
}

function varint(value) {
  let number = BigInt(value);
  const output = [];
  while (number > 127n) {
    output.push(Number((number & 127n) | 128n));
    number >>= 7n;
  }
  output.push(Number(number));
  return Buffer.from(output);
}

function zigzag(value) {
  const number = BigInt(value);
  return number < 0n ? ((-number) << 1n) - 1n : number << 1n;
}

function protoBytes(tag, body) {
  const value = Buffer.from(body);
  if (value.length === 0) {
    return Buffer.alloc(0);
  }
  return Buffer.concat([
    varint((BigInt(tag) << 3n) | 2n),
    varint(value.length),
    value,
  ]);
}

function protoString(tag, value) {
  return protoBytes(tag, Buffer.from(String(value)));
}

function protoSInt(tag, value) {
  return Buffer.concat([
    varint(BigInt(tag) << 3n),
    varint(zigzag(value)),
  ]);
}

function protoFloat(tag, value) {
  const body = Buffer.alloc(4);
  body.writeFloatLE(value);
  return Buffer.concat([varint((BigInt(tag) << 3n) | 5n), body]);
}

function proto(...fields) {
  return Buffer.concat(fields);
}

function deviceProto(deviceId) {
  return proto(
    protoSInt(1, 1),
    protoSInt(2, 2),
    protoString(3, APP_ID),
    protoString(4, deviceId),
    protoString(5, "Ai6svO3PyrwDOUSmO6ZcResxu"),
    protoString(6, "!noperm!"),
    protoSInt(7, -888888),
    protoSInt(8, -888888),
    protoSInt(9, 3),
    protoSInt(10, -888888),
    protoString(11, "!notset!"),
    protoString(12, "Asia/Shanghai,8"),
    protoString(13, "zh_CN"),
    protoSInt(14, 4),
    protoFloat(16, 255.24993896484375),
    protoFloat(17, 35.58599090576172),
    protoFloat(18, 3.467449188232422),
    protoFloat(19, 3.467449188232422),
    protoFloat(20, 255.1754913330078),
    protoFloat(21, 42.17544174194336),
    protoString(22, "16"),
    protoSInt(23, 41),
    protoSInt(24, 36),
    protoSInt(25, 1728388016635),
    protoSInt(26, 1728388016635),
    protoSInt(27, 1728388016635),
    protoSInt(28, 1728388016637),
    protoSInt(29, -1),
    protoString(30, "25053RT47C"),
    protoString(31, "Redmi"),
    protoString(32, "25053RT47C"),
    protoString(33, "25053RT47C"),
    protoString(34, "Xiaomi"),
    protoString(35, "Redmi"),
    protoString(36, "Redmi"),
    protoSInt(38, 31),
  );
}

function xmxor(data, key) {
  const length = data.length;
  const encoded = Buffer.alloc(length);
  for (let index = 0; index < length; index += 1) {
    const offset = (index * 4) & 28;
    const first = key[offset];
    const second = key[offset + 1];
    let value =
      (((data[index] << 4) | (data[index] >>> 4)) & 0xff) + first;
    value = (~value) ^ second;
    value = (((value & 0xff) << 3) | ((value & 0xff) >>> 5)) & 0xff;
    value = (value + second) & 0xff;
    value ^= first;
    encoded[length - index - 1] = ~value & 0xff;
  }
  const last = encoded[length - 1] ^ encoded[length - 2];
  const first = encoded[0];
  encoded[0] = (~last + first) & 0xff;
  encoded[1] =
    ((encoded[0] ^ encoded[length - 1] ^ 254) + encoded[1]) & 0xff;
  const shifted =
    ((encoded[1] << 3) | (encoded[1] >>> 5)) & 0xff;
  const fix = (last - first) ^ (shifted ^ 2);
  encoded[2] = (encoded[2] + fix) & 0xff;
  for (let index = 0; index < length - 4; index += 1) {
    const shiftedValue =
      ((encoded[index + 2] << 3) | (encoded[index + 2] >>> 5)) & 0xff;
    const temporary =
      shiftedValue ^ encoded[index + 1] ^ (index + 3);
    encoded[index + 3] = (~temporary + encoded[index + 3]) & 0xff;
  }
  encoded[length - 1] ^= encoded[length - 2];
  let total = 0;
  for (let index = 1; index < length; index += 1) {
    total += encoded[index];
  }
  encoded[0] = ((encoded[0] ^ encoded[1]) + total) & 0xff;
  return encoded;
}

function keyHash(signKey, random) {
  const hash = sm3(
    Buffer.concat([signKey, le32(random), signKey]),
  );
  const first = (random >> 16) & 0xff;
  let seed =
    ((first << 11) | (random >>> 24)) ^
    (first >> 5) ^
    first;
  seed = ~seed >>> 0;
  return [hash, le32(seed)];
}

function medusaSignKey() {
  return Buffer.from(
    "8ebdfa3806ecc5cee79423e6029ed82540bc2218bb7eaef71cb691f7aa8aa2f5",
    "hex",
  );
}

function assembleMedusa(
  rawUrl,
  body,
  khronos,
  deviceId,
  versionName,
  entropy,
) {
  const queryAt = rawUrl.indexOf("?");
  const query = queryAt >= 0 ? rawUrl.slice(queryAt + 1) : "";
  const bodyMd5 = body ? md5(body) : Buffer.alloc(16);
  const querySm3 = sm3(Buffer.from(query));
  const timestamp = le32(khronos);
  const queryBodyTimestamp = hashF13(
    querySm3,
    bodyMd5,
    timestamp,
    khronos,
  );
  const check =
    ((querySm3[0] & 63) << 14) |
    0x18000001 |
    ((queryBodyTimestamp[0] & 63) << 8);
  const nested = proto(
    protoSInt(1, 111),
    protoSInt(2, 10),
    protoSInt(3, 694367),
    protoSInt(5, 586952199),
  );
  const nested13 = proto(
    protoSInt(1, entropy.nowSecs),
    protoSInt(2, -2),
    protoSInt(4, 200),
  );
  const environment = proto(
    protoSInt(1, entropy.envLaunch),
    protoSInt(2, 146331399),
    protoSInt(3, 146331396),
    protoSInt(5, 7),
    protoString(6, "v04.06.04.03-bugfix"),
    protoSInt(7, entropy.envPid),
    protoBytes(12, deviceProto(deviceId)),
    protoBytes(13, nested13),
    protoString(14, versionName),
  );
  const queryHash = sm3(
    Buffer.concat([Buffer.from(query), bodyMd5, Buffer.from("none")]),
  );
  const message = proto(
    protoBytes(1, Buffer.from("f7e85ffad7d7dc3bd62ac87057cf6118", "hex")),
    protoSInt(2, 3),
    protoSInt(3, entropy.messageRandom),
    protoString(4, APP_ID),
    protoString(5, deviceId),
    protoString(6, CHANNEL_ID),
    protoString(7, versionName),
    protoString(8, "v04.06.04-ml-android"),
    protoSInt(9, 67503104),
    protoBytes(10, Buffer.from("4001000000000000", "hex")),
    protoSInt(12, khronos),
    protoBytes(13, queryBodyTimestamp),
    protoBytes(14, querySm3.subarray(0, 6)),
    protoBytes(15, nested),
    protoString(16, "AXYQOS6n2m60x1fVZHIrH3iol"),
    protoSInt(17, khronos),
    protoBytes(19, queryHash),
    protoString(20, "none"),
    protoSInt(21, 312),
    protoBytes(23, environment),
    protoString(
      24,
      '{"cmr":16777216,"cmr2":16777216,"un_h":1879194040,"vpn":0,"kd":0,"fkd":3672518972,"pd":-1872573247,"dyn":"","do":0,"tk":true}',
    ),
  );
  const [hash, seed] = keyHash(medusaSignKey(), entropy.random);
  let transformed = Buffer.concat([
    Buffer.from("4001000000000000", "hex"),
    xmxor(message, hash),
  ]).reverse();
  for (let index = 0; index < transformed.length; index += 1) {
    transformed[index] ^= seed[~index & 3];
  }
  const packed = Buffer.concat([
    Buffer.from([0x35]),
    le32(entropy.packedRandom),
    le32(check),
    transformed,
    Buffer.from([entropy.random >>> 16, entropy.random >>> 24]),
  ]);
  const encrypted = new AesV3(
    Buffer.from("f1593376766ea98d34f31b057a9d5be4", "hex"),
    khronos,
  ).encrypt(
    packed,
    Buffer.from("1fe109a4125283f418de9e051a969e12", "hex"),
  );
  const version = Buffer.from(
    "03000000f7e85ffad7d7dc3bd62ac87057cf6118",
    "hex",
  );
  const prefix = Buffer.alloc(20);
  for (let index = 0; index < 5; index += 1) {
    prefix.writeUInt32LE(
      u32(version.readUInt32LE(index * 4) ^ khronos),
      index * 4,
    );
  }
  return Buffer.concat([
    prefix,
    Buffer.from([
      entropy.random & 0xff,
      (entropy.random >>> 8) & 0xff,
      0,
      1,
    ]),
    encrypted,
  ]).toString("base64");
}

function encodeComponent(value) {
  return encodeURIComponent(String(value))
    .replace(/[!'()*]/g, (character) =>
      `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
    );
}

export function encodeQueryPairs(pairs) {
  return pairs
    .map(([name, value]) => `${encodeComponent(name)}=${encodeComponent(value)}`)
    .join("&");
}

function drawEntropy(nowMillis) {
  const buffer = crypto.randomBytes(16);
  const seed = buffer.readBigUInt64LE(0);
  return {
    envLaunch: 100 + Number(seed % 21n),
    envPid: 10001 + (buffer.readUInt16LE(8) % 2000),
    nowSecs: Math.floor(nowMillis / 1000),
    messageRandom: buffer.readUInt32LE(0),
    random: buffer.readUInt32LE(4),
    packedRandom: buffer.readUInt32LE(8),
    gorgonRandom: buffer.readUInt16LE(12),
    heliosRandom: buffer.readUInt32LE(12),
  };
}

function signedRequest({
  path,
  pairs,
  nowMillis = Date.now(),
  deviceId,
  versionName = VERSION_NAME,
  origin = MEDUSA_URL_ORIGIN,
  body = null,
  entropy = null,
  requireBranch = null,
}) {
  if (!/^\d{1,30}$/.test(String(deviceId)) || !/[1-9]/.test(deviceId)) {
    throw new Error("设备身份无效。");
  }
  const fields = entropy || drawEntropy(nowMillis);
  const hasBody = body !== null;
  const bodyMd5 = hasBody ? md5(body) : Buffer.alloc(16);
  const khronos = Math.floor(nowMillis / 1000);
  let query = "";
  let ticket = 0;
  for (let offset = 0; offset < 256; offset += 1) {
    ticket = nowMillis + offset;
    const candidate = [
      ...pairs,
      ["ts", String(khronos)],
      ["_rticket", String(ticket)],
    ];
    query = encodeQueryPairs(candidate);
    const branch = branchOf(
      sm3(Buffer.from(query)),
      bodyMd5,
      le32(khronos),
    );
    if (requireBranch === null ? branch !== 1 : branch === requireBranch) {
      break;
    }
  }
  if (!query) {
    throw new Error("无法生成 App 请求签名。");
  }
  const actualEntropy = {
    ...fields,
    nowSecs: fields.nowSecs || khronos,
  };
  const rawUrl = `${String(origin).replace(/\/+$/, "")}${path}?${query}`;
  const headers = {
    Accept: "application/json; charset=utf-8,application/x-protobuf",
    "x-xs-from-web": "0",
    "x-ss-req-ticket": String(ticket),
    "x-tt-request-tag": "t=0;n=0",
    "sdk-version": "2",
    "passport-sdk-version": "50561",
    "x-vc-bdturing-sdk-version": "3.7.2.cn",
    "x-khronos": String(khronos),
    "x-ladon": be32(khronos).toString("base64"),
    "x-argus": le32(khronos).toString("base64"),
    "x-gorgon": xGorgon(
      query,
      body,
      khronos,
      actualEntropy.gorgonRandom,
    ),
    "x-helios": helios(khronos, actualEntropy.heliosRandom),
    "x-medusa": assembleMedusa(
      rawUrl,
      body,
      khronos,
      String(deviceId),
      versionName,
      actualEntropy,
    ),
    "x-tt-dt": "",
  };
  if (hasBody) {
    headers["Content-Type"] = "application/json; charset=UTF-8";
    headers["x-ss-stub"] = md5(body).toString("hex").toUpperCase();
  }
  return {
    query,
    ticket,
    khronos,
    headers,
  };
}

export function signAppGet({
  path,
  pairs,
  nowMillis = Date.now(),
  deviceId,
  versionName = VERSION_NAME,
  origin = MEDUSA_URL_ORIGIN,
  entropy = null,
  requireBranch = null,
}) {
  return signedRequest({
    path,
    pairs,
    nowMillis,
    deviceId,
    versionName,
    origin,
    entropy,
    requireBranch,
  });
}

export function signAppPost({
  path,
  pairs = [],
  body,
  nowMillis = Date.now(),
  deviceId,
  versionName = VERSION_NAME,
  origin = MEDUSA_URL_ORIGIN,
  entropy = null,
  requireBranch = null,
}) {
  return signedRequest({
    path,
    pairs,
    body: Buffer.from(body),
    nowMillis,
    deviceId,
    versionName,
    origin,
    entropy,
    requireBranch,
  });
}

export function accountDevicePairs(deviceId, installId, cdid) {
  if (
    !/^\d{1,30}$/.test(String(installId)) ||
    !/[1-9]/.test(String(installId))
  ) {
    throw new Error("安装身份无效。");
  }
  if (!/^[a-f0-9-]{36}$/i.test(String(cdid))) {
    throw new Error("设备关联标识无效。");
  }
  return [
    ...Object.entries(ACCOUNT_DEVICE),
    ["iid", String(installId)],
    ["device_id", String(deviceId)],
    ["cdid", String(cdid)],
  ];
}

export function appRequestUrl(path, query) {
  return `${DEVICE_API_ORIGIN}${path}?${query}`;
}

export function userAgent() {
  return "com.phoenix.read/73932 (Linux; U; Android 14; zh_CN; 23127PN0CC; Build/UKQ1.230804.001; Cronet/TTNetVersion:8d40f833 2026-03-03 QuicVersion:21ac1950 2025-11-18)";
}

export function accountUserAgent() {
  return "com.phoenix.read/72232 (Linux; U; Android 16; zh_CN; 25053RT47C; Build/BP2A.250605.031.A3)";
}

const BOOTSTRAP_HEADER_ORDER = [
  "display_name",
  "update_version_code",
  "manifest_version_code",
  "app_version_minor",
  "aid",
  "channel",
  "package",
  "app_version",
  "version_code",
  "os",
  "os_version",
  "os_api",
  "device_model",
  "device_brand",
  "device_manufacturer",
  "cpu_abi",
  "language",
  "timezone",
  "access",
  "region",
  "tz_name",
  "tz_offset",
  "cdid",
  "openudid",
  "clientudid",
  "ipv6_list",
  "sim_serial_number",
  "oaid_may_support",
  "req_id",
  "device_platform",
  "guest_mode",
  "is_system_app",
  "sdk_flavor",
];

function orderedJson(values, preferred) {
  const seen = new Set();
  const keys = [];
  for (const key of preferred) {
    if (Object.hasOwn(values, key)) {
      keys.push(key);
      seen.add(key);
    }
  }
  const rest = Object.keys(values)
    .filter((key) => !seen.has(key))
    .sort();
  keys.push(...rest);
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${JSON.stringify(values[key])}`)
    .join(",")}}`;
}

function bootstrapPlaintext(identity, generatedAt) {
  const issuedAt = generatedAt.getTime() - 200;
  const header = {
    display_name: "红果免费短剧",
    update_version_code: 73932,
    manifest_version_code: 73932,
    app_version_minor: VERSION_NAME,
    aid: 8662,
    channel: "update_64",
    package: "com.phoenix.read",
    app_version: VERSION_NAME,
    version_code: 73932,
    sdk_version: "3.7.0-rc.34-fanqie-xiaoshuo",
    sdk_target_version: 29,
    git_hash: "3a88f4e",
    os: "Android",
    os_version: "16",
    os_api: 36,
    device_model: "25053RT47C",
    device_brand: "Redmi",
    device_manufacturer: "Redmi",
    cpu_abi: "arm64-v8a",
    release_build: "b5e187f",
    density_dpi: 520,
    display_density: "mdpi",
    resolution: "1280x2772",
    language: "zh",
    timezone: 8,
    access: "wifi",
    not_request_sender: 0,
    carrier: "CHINA MOBILE",
    mcc_mnc: "46000",
    rom: "eng.root.20231116.160340",
    rom_version: "W528JS release-keys",
    region: "CN",
    tz_name: "Asia/Shanghai",
    tz_offset: 28800,
    sim_region: "cn",
    cdid: identity.cdid,
    sig_hash: "56a962410c494bbaf0b58dba20cae56f",
    openudid: identity.openudid,
    clientudid: identity.clientudid,
    ipv6_list: [],
    sim_serial_number: [],
    oaid_may_support: false,
    req_id: identity.reqId,
    device_platform: "android",
    custom: {
      account_region_src: "fallback",
      account_region: "cn",
      host_bit: 64,
      dragon_device_type: "phone",
    },
    pre_installed_channel: "",
    apk_first_install_time: issuedAt + 200,
    guest_mode: 0,
    is_system_app: 0,
    sdk_flavor: "china",
  };
  return Buffer.from(
    `{"magic_tag":"ss_app_log","header":${orderedJson(
      header,
      BOOTSTRAP_HEADER_ORDER,
    )},"_gen_time":${generatedAt.getTime()}}`,
  );
}

const TT_ENCRYPT_CONSTANT = Buffer.from(
  "4dd4c2e6b83162090e52b3c7a6733ba41cb2462b829ab58a196b39db57177524f49baf7f08e8d68d26a72e37c1a95a2f1f05a51892aef2949732b62a38aadd58",
  "hex",
);

export function ttEncrypt(input, random = crypto.randomBytes(32)) {
  if (!Buffer.isBuffer(random) || random.length !== 32) {
    throw new Error("设备注册随机数必须为 32 字节。");
  }
  const randomHash = crypto
    .createHash("sha512")
    .update(random)
    .digest();
  const keyIv = crypto
    .createHash("sha512")
    .update(Buffer.concat([randomHash, TT_ENCRYPT_CONSTANT]))
    .digest();
  const digest = crypto.createHash("sha512").update(input).digest();
  const plain = Buffer.concat([digest, input]);
  const padding = 16 - (plain.length % 16);
  const padded = Buffer.concat([plain, Buffer.alloc(padding, padding)]);
  const cipher = crypto.createCipheriv(
    "aes-128-cbc",
    keyIv.subarray(0, 16),
    keyIv.subarray(16, 32),
  );
  cipher.setAutoPadding(false);
  const encrypted = Buffer.concat([cipher.update(padded), cipher.final()]);
  return Buffer.concat([
    Buffer.from("746305100000", "hex"),
    random,
    encrypted,
  ]);
}

export function buildRegisterBody(identity, generatedAt = new Date()) {
  const plain = bootstrapPlaintext(identity, generatedAt);
  const compressed = gzipSync(plain);
  return ttEncrypt(compressed);
}

export function buildRegisterIdentity() {
  return {
    cdid: crypto.randomUUID(),
    openudid: crypto.randomBytes(8).toString("hex"),
    clientudid: crypto.randomUUID(),
    oaid: crypto.randomUUID(),
    reqId: crypto.randomUUID(),
  };
}

export function preserveLargeIntegerFields(raw, fields) {
  const names = fields
    .map((field) => String(field).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  return String(raw).replace(
    new RegExp(
      `("(?:${names})"\\s*:\\s*)(-?\\d{16,})(?=\\s*[,}\\]])`,
      "g",
    ),
    '$1"$2"',
  );
}

function registrationCookies(setCookies) {
  const cookies = new Map();
  for (const header of Array.isArray(setCookies) ? setCookies : []) {
    const pair = String(header || "").split(";", 1)[0].trim();
    const separator = pair.indexOf("=");
    if (separator <= 0) {
      continue;
    }
    const name = pair.slice(0, separator).trim();
    const value = pair.slice(separator + 1).trim();
    if (
      /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(name) &&
      value &&
      value.length <= 4096
    ) {
      cookies.set(name, value);
    }
  }
  return Object.fromEntries(cookies);
}

export function parseRegisterResponse(raw, setCookies = []) {
  let payload;
  try {
    payload = JSON.parse(
      preserveLargeIntegerFields(raw, [
        "device_id",
        "install_id",
      ]),
    );
  } catch {
    throw new Error("红果设备注册响应格式异常。");
  }
  if (
    payload?.code !== undefined &&
    Number(payload.code) !== 0
  ) {
    throw new Error("红果设备注册未通过，请稍后重试。");
  }
  const deviceId = String(
    payload?.device_id_str || payload?.device_id || "",
  ).trim();
  const installId = String(
    payload?.install_id_str || payload?.install_id || "",
  ).trim();
  if (
    !/^\d{1,30}$/.test(deviceId) ||
    !/[1-9]/.test(deviceId) ||
    !/^\d{1,30}$/.test(installId) ||
    !/[1-9]/.test(installId)
  ) {
    throw new Error("红果设备注册未返回有效身份。");
  }
  return {
    deviceId,
    installId,
    deviceToken: String(payload?.device_token || ""),
    newUser: Number(payload?.new_user) === 1,
    cookies: registrationCookies(setCookies),
  };
}

export const __test = {
  assembleHelios: helios,
  assembleMedusa,
  bootstrapPlaintext,
  branchOf,
  keyHash,
  medusaSignKey,
  xmxor,
};
