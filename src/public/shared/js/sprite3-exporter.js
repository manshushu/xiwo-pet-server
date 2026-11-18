// 纯前端无依赖 Mind+ / Scratch 3.0 角色包 (.sprite3) 合成与导出引擎
(function (globalScope) {
    'use strict';

    // UTF-8 字符串转字节数组
    function utf8ToBytes(str) {
        if (typeof TextEncoder !== 'undefined') {
            return new TextEncoder().encode(str);
        }
        const utf8 = unescape(encodeURIComponent(str));
        const bytes = new Uint8Array(utf8.length);
        for (let i = 0; i < utf8.length; i++) {
            bytes[i] = utf8.charCodeAt(i);
        }
        return bytes;
    }

    // 标准 CRC32 查找表（用于 ZIP 校验）
    const CRC32_TABLE = (function () {
        const table = new Uint32Array(256);
        for (let i = 0; i < 256; i++) {
            let c = i;
            for (let k = 0; k < 8; k++) {
                c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
            }
            table[i] = c >>> 0;
        }
        return table;
    })();

    function crc32(bytes) {
        let crc = 0xFFFFFFFF;
        for (let i = 0; i < bytes.length; i++) {
            crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
        }
        return (crc ^ 0xFFFFFFFF) >>> 0;
    }

    // 标准 RFC 1321 MD5（基于字节数组计算，输出 32 位小写 hex 作为 Scratch assetId）
    function md5Hex(bytes) {
        const len = bytes.length;
        const bitLen = len * 8;
        const paddedLen = (((len + 8) >>> 6) + 1) << 6;
        const padded = new Uint8Array(paddedLen);
        padded.set(bytes);
        padded[len] = 0x80;

        const view = new DataView(padded.buffer);
        view.setUint32(paddedLen - 8, bitLen >>> 0, true);
        view.setUint32(paddedLen - 4, Math.floor(bitLen / 0x100000000) >>> 0, true);

        const s = [
            7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
            5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
            4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
            6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21
        ];
        const K = new Uint32Array(64);
        for (let i = 0; i < 64; i++) {
            K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000) >>> 0;
        }

        let a0 = 0x67452301;
        let b0 = 0xEFCDAB89;
        let c0 = 0x98BADCFE;
        let d0 = 0x10325476;

        for (let offset = 0; offset < paddedLen; offset += 64) {
            const M = new Uint32Array(16);
            for (let j = 0; j < 16; j++) {
                M[j] = view.getUint32(offset + j * 4, true);
            }

            let A = a0;
            let B = b0;
            let C = c0;
            let D = d0;

            for (let i = 0; i < 64; i++) {
                let F = 0;
                let g = 0;
                if (i < 16) {
                    F = (B & C) | ((~B) & D);
                    g = i;
                } else if (i < 32) {
                    F = (D & B) | ((~D) & C);
                    g = (5 * i + 1) & 15;
                } else if (i < 48) {
                    F = B ^ C ^ D;
                    g = (3 * i + 5) & 15;
                } else {
                    F = C ^ (B | (~D));
                    g = (7 * i) & 15;
                }

                const temp = (F + A + K[i] + M[g]) >>> 0;
                A = D;
                D = C;
                C = B;
                const shift = s[i];
                B = (B + ((temp << shift) | (temp >>> (32 - shift)))) >>> 0;
            }

            a0 = (a0 + A) >>> 0;
            b0 = (b0 + B) >>> 0;
            c0 = (c0 + C) >>> 0;
            d0 = (d0 + D) >>> 0;
        }

        const toLittleEndianHex = (n) => {
            let hex = '';
            for (let i = 0; i < 4; i++) {
                hex += ((n >>> (i * 8)) & 0xFF).toString(16).padStart(2, '0');
            }
            return hex;
        };

        return toLittleEndianHex(a0) + toLittleEndianHex(b0) + toLittleEndianHex(c0) + toLittleEndianHex(d0);
    }

    // 纯内存构建标准 ZIP (STORE 无压缩模式，UTF-8 文件名支持)
    function buildZipBytes(entries) {
        const now = new Date();
        const dosTime = ((now.getHours() & 0x1F) << 11) | ((now.getMinutes() & 0x3F) << 5) | ((now.getSeconds() >> 1) & 0x1F);
        const dosDate = (((Math.max(1980, now.getFullYear()) - 1980) & 0x7F) << 9) | (((now.getMonth() + 1) & 0x0F) << 5) | (now.getDate() & 0x1F);

        const localParts = [];
        const centralParts = [];
        let offset = 0;

        for (const entry of entries) {
            const nameBytes = utf8ToBytes(entry.name);
            const dataBytes = entry.data instanceof Uint8Array ? entry.data : utf8ToBytes(String(entry.data));
            const crc = crc32(dataBytes);

            // Local File Header (30 bytes + filename)
            const localHeader = new Uint8Array(30 + nameBytes.length);
            const lv = new DataView(localHeader.buffer);
            lv.setUint32(0, 0x04034B50, true);
            lv.setUint16(4, 20, true);
            lv.setUint16(6, 0x0800, true); // UTF-8 filename flag
            lv.setUint16(8, 0, true);      // STORE
            lv.setUint16(10, dosTime, true);
            lv.setUint16(12, dosDate, true);
            lv.setUint32(14, crc, true);
            lv.setUint32(18, dataBytes.length, true);
            lv.setUint32(22, dataBytes.length, true);
            lv.setUint16(26, nameBytes.length, true);
            lv.setUint16(28, 0, true);
            localHeader.set(nameBytes, 30);

            localParts.push(localHeader, dataBytes);

            // Central Directory File Header (46 bytes + filename)
            const centralHeader = new Uint8Array(46 + nameBytes.length);
            const cv = new DataView(centralHeader.buffer);
            cv.setUint32(0, 0x02014B50, true);
            cv.setUint16(4, 20, true);
            cv.setUint16(6, 20, true);
            cv.setUint16(8, 0x0800, true);
            cv.setUint16(10, 0, true);
            cv.setUint16(12, dosTime, true);
            cv.setUint16(14, dosDate, true);
            cv.setUint32(16, crc, true);
            cv.setUint32(20, dataBytes.length, true);
            cv.setUint32(24, dataBytes.length, true);
            cv.setUint16(28, nameBytes.length, true);
            cv.setUint16(30, 0, true);
            cv.setUint16(32, 0, true);
            cv.setUint16(34, 0, true);
            cv.setUint16(36, 0, true);
            cv.setUint32(38, 0, true);
            cv.setUint32(42, offset, true);
            centralHeader.set(nameBytes, 46);

            centralParts.push(centralHeader);
            offset += localHeader.length + dataBytes.length;
        }

        const centralSize = centralParts.reduce((acc, part) => acc + part.length, 0);
        const eocd = new Uint8Array(22);
        const ev = new DataView(eocd.buffer);
        ev.setUint32(0, 0x06054B50, true);
        ev.setUint16(4, 0, true);
        ev.setUint16(6, 0, true);
        ev.setUint16(8, entries.length, true);
        ev.setUint16(10, entries.length, true);
        ev.setUint32(12, centralSize, true);
        ev.setUint32(16, offset, true);
        ev.setUint16(20, 0, true);

        const totalLength = offset + centralSize + eocd.length;
        const result = new Uint8Array(totalLength);
        let cursor = 0;
        for (const p of localParts) {
            result.set(p, cursor);
            cursor += p.length;
        }
        for (const p of centralParts) {
            result.set(p, cursor);
            cursor += p.length;
        }
        result.set(eocd, cursor);
        return result;
    }

    function sanitizeFilenamePart(text, fallback = '宠物') {
        const cleaned = String(text || '')
            .replace(/[\\/:*?"<>|\r\n\t]+/g, '_')
            .replace(/\s+/g, '_')
            .replace(/^_+|_+$/g, '');
        return cleaned || fallback;
    }

    /**
     * 生成完整 .sprite3 二进制数据与文件名
     * @param {Object} params
     * @param {string} params.studentUsername 学号（如 s01）
     * @param {string} params.petNickname 学生自定义昵称或造型名（可选）
     * @param {string} params.speciesName 物种名称（如 暖萌小橘）
     * @param {string} params.skinId 物种ID
     * @param {Array<string>} params.accessories 饰品与五官ID列表
     * @param {number} params.colorHue 本体毛色色相微调
     * @param {number} params.level 宠物等级
     * @param {Object} params.renderer 可选传入 PetRenderer（默认使用 window.PetRenderer）
     */
    function buildSprite3Package(params = {}) {
        const renderer = params.renderer || (typeof window !== 'undefined' ? window.PetRenderer : null);
        if (!renderer || typeof renderer.renderExportCostumes !== 'function') {
            throw new Error('PetRenderer 未就绪或缺少导出方法');
        }

        const skinId = params.skinId || 'default_cat';
        const accessories = Array.isArray(params.accessories) ? params.accessories : [];
        const colorHue = Number(params.colorHue) || 0;
        const level = Number(params.level) || 1;
        const speciesName = params.speciesName || '我的萌宠';
        const nickname = (params.petNickname || '').trim();
        const studentUsername = (params.studentUsername || 'student').trim();

        // 1. 生成 5 个纯矢量动作造型 SVG
        const rawCostumes = renderer.renderExportCostumes(skinId, accessories, colorHue, { level });

        const zipEntries = [];
        const costumeRecords = [];
        const seenMd5 = new Set();

        for (const item of rawCostumes) {
            const svgBytes = utf8ToBytes(item.svg);
            const assetId = md5Hex(svgBytes);
            const md5ext = `${assetId}.svg`;

            if (!seenMd5.has(md5ext)) {
                seenMd5.add(md5ext);
                zipEntries.push({ name: md5ext, data: svgBytes });
            }

            costumeRecords.push({
                assetId,
                name: item.name,
                bitmapResolution: 1,
                md5ext,
                dataFormat: 'svg',
                rotationCenterX: 60,
                rotationCenterY: 60
            });
        }

        // 2. 构建规范、纯净（无预置积木）的 Scratch 3.0 / Mind+ sprite.json
        const spriteDisplayName = nickname || speciesName;
        const spriteJson = {
            isStage: false,
            name: spriteDisplayName,
            variables: {},
            lists: {},
            broadcasts: {},
            blocks: {},
            comments: {},
            currentCostume: 0,
            costumes: costumeRecords,
            sounds: [],
            volume: 100,
            visible: true,
            x: 0,
            y: 0,
            size: 100,
            direction: 90,
            draggable: false,
            rotationStyle: 'left-right'
        };

        zipEntries.unshift({
            name: 'sprite.json',
            data: utf8ToBytes(JSON.stringify(spriteJson))
        });

        const zipBytes = buildZipBytes(zipEntries);

        // 3. 构造标准命名：学号_昵称_物种.sprite3（若无昵称则为 学号_物种.sprite3）
        const nameParts = [sanitizeFilenamePart(studentUsername, 'student')];
        if (nickname && nickname !== speciesName) {
            nameParts.push(sanitizeFilenamePart(nickname));
        }
        nameParts.push(sanitizeFilenamePart(speciesName, '宠物'));
        const filename = `${nameParts.join('_')}.sprite3`;

        return {
            filename,
            spriteJson,
            costumesCount: costumeRecords.length,
            zipBytes
        };
    }

    /**
     * 浏览器端直接合成并触发下载 .sprite3 文件
     */
    function exportAndDownload(params = {}) {
        const pkg = buildSprite3Package(params);
        const blob = new Blob([pkg.zipBytes], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = pkg.filename;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 1000);
        return pkg;
    }

    const Sprite3Exporter = {
        utf8ToBytes,
        crc32,
        md5Hex,
        buildZipBytes,
        buildSprite3Package,
        exportAndDownload
    };

    if (typeof window !== 'undefined') {
        window.Sprite3Exporter = Sprite3Exporter;
    }
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = Sprite3Exporter;
    }
})(typeof window !== 'undefined' ? window : globalThis);
