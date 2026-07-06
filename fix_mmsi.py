import re

with open('frontend/src/utils/mapUtils.ts', 'r') as f:
    content = f.read()

mmsi_code = """
export const getMmsiFlagHtml = (mmsi: string | number) => {
  const mStr = String(mmsi);
  if (mStr.length !== 9) return '';
  const mid = parseInt(mStr.substring(0, 3));
  const midMap: Record<number, string> = {
    211: 'DE', 218: 'DE', 232: 'GB', 233: 'GB', 234: 'GB', 235: 'GB',
    338: 'US', 366: 'US', 367: 'US', 368: 'US', 369: 'US', 226: 'FR', 227: 'FR', 228: 'FR',
    247: 'IT', 224: 'ES', 225: 'ES', 316: 'CA', 503: 'AU', 431: 'JP', 432: 'JP',
    412: 'CN', 413: 'CN', 414: 'CN', 273: 'RU', 272: 'UA', 261: 'PL', 271: 'TR',
    244: 'NL', 245: 'NL', 246: 'NL', 269: 'CH', 265: 'SE', 266: 'SE', 257: 'NO', 258: 'NO', 259: 'NO',
    219: 'DK', 220: 'DK', 230: 'FI', 203: 'AT', 205: 'BE', 710: 'BR', 345: 'MX', 419: 'IN',
    601: 'ZA', 250: 'IE', 237: 'GR', 238: 'GR', 239: 'GR', 240: 'GR', 241: 'GR', 263: 'PT',
    512: 'NZ', 563: 'SG', 564: 'SG', 565: 'SG', 566: 'SG', 470: 'AE', 403: 'SA', 428: 'IL',
    440: 'KR', 441: 'KR', 416: 'TW', 477: 'HK', 567: 'TH', 533: 'MY', 525: 'ID', 574: 'VN',
    548: 'PH', 622: 'EG', 242: 'MA',
    351: 'PA', 352: 'PA', 353: 'PA', 354: 'PA', 355: 'PA', 356: 'PA', 357: 'PA', 370: 'PA', 371: 'PA', 372: 'PA', 373: 'PA', 374: 'PA',
    636: 'LR', 637: 'LR', 538: 'MH', 215: 'MT', 229: 'MT', 248: 'MT', 249: 'MT', 256: 'MT',
    308: 'BS', 309: 'BS', 311: 'BS', 209: 'CY', 210: 'CY', 212: 'CY', 304: 'AG', 305: 'AG',
    375: 'VC', 376: 'VC', 377: 'VC', 576: 'VU', 577: 'VU', 319: 'KY', 310: 'BM', 236: 'GI', 231: 'FO'
  };
  const code = midMap[mid];
  if (!code) return '';
  return `<img src="https://flagcdn.com/w20/${code.toLowerCase()}.png" width="16" alt="${code}" style="vertical-align: middle; border-radius: 1px;" />`;
};
"""

# replace the placeholder from fix_map2.py
content = re.sub(r'export const getMmsiFlagHtml = .*?return \'\';\n};\n', mmsi_code, content, flags=re.DOTALL)

with open('frontend/src/utils/mapUtils.ts', 'w') as f:
    f.write(content)

print("MMSI flag HTML util fixed.")
