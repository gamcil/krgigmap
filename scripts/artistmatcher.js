const fs = require('fs');
const path = require('path');
const Fuse = require('fuse.js');
const hangul = require('es-hangul');


const EN_TO_HANGUL = {
    A: '에이', B: '비', C: '씨', D: '디', E: '이',
    F: '에프', G: '지', H: '에이치', I: '아이', J: '제이',
    K: '케이', L: '엘', M: '엠', N: '엔', O: '오',
    P: '피', Q: '큐', R: '알', S: '에스', T: '티',
    U: '유', V: '브이', W: '더블유', X: '엑스', Y: '와이', Z: '지'
};

// Digits -> hangul (e.g. 001클럽 to 영영일클럽)
// Latin characters -> hangul (e.g. AP스튜디오 to 에이피스튜디오)
// Normalize, remove diacritics, whitespace, special characters
function normalize(text) {
    if (!text) return ''
    const changeAlphanumeric = (c) => {
        let C = c.toUpperCase()
        return (c >= '0' && c <= '9')
            ? hangul.numberToHangul(parseInt(c))
            : (EN_TO_HANGUL[C] ? EN_TO_HANGUL[C] : c);
    }
    return text.split('')
        .map(changeAlphanumeric)
        .join('')
        .replace(/[^가-힣a-zA-Z0-9 ]/g, '')
        .normalize("NFKD")  // decomposes hangul to jamo
        .toLowerCase()
        .replace(/([\u0041-\u007A])[\u0300-\u036f]+/g, '$1')  // latin diacritics
        .replace(/\s+/g, '')  // whitespace
        .normalize("NFC")   // recompose here for hangul.disassemble
}

function normalizeLatin(text) {
    if (!text) return '';
    return String(text)
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .normalize('NFC')
        .toLowerCase()
        .replace(/[^a-z0-9가-힣]/g, '')
        .normalize('NFC');
}

function buildFuseIndex(artists) {
    return new Fuse(
        artists.map((v, i) => ({
            id: i,
            // key: `${i}_${v.name_ko}_${v.name_en}`,
            name: normalize(v.name_ko),
            name_en: normalizeLatin(v.name_en),
            aliases: v.alias?.map(a => normalize(a)) || [],
            aliases_en: v.alias?.map(normalizeLatin) || [],
            nameJamo: hangul.disassemble(normalize(v.name_ko)),
            // aliasesJamo: (v.aliases || []).map(a => hangul.disassemble(normalize(a))).join(''),
        })), {
        keys: [
            { name: 'name', weight: 1.0 },
            { name: 'nameJamo', weight: 0.8 },
            { name: 'name_en', weight: 0.5 },
            { name: 'aliases_en', weight: 0.3 },
            { name: 'aliases', weight: 0.1 },
            // { name: 'aliasesJamo', weight: 0.02 }
        ],
        ignoreLocation: true,
        threshold: 0.2,
        shouldSort: true,
        distance: 300
    });
}

function getArtistList() {
    return JSON.parse(fs.readFileSync(path.resolve(__dirname, 'artists.json')));
}


async function matchEventsToArtists(events) {
    const artists = getArtistList();
    const index = buildFuseIndex(artists);

    const uniqueArtists = new Set();
    for (const event of events) {
        for (const name of event.artists || []) {
            const artistName = String(name).replaceAll('내한', '').trim();
            if (artistName) uniqueArtists.add(artistName);
        }
    }

    const matchedArtists = [];
    const unmatchedArtists = Object.create(null);
    const artistNameToId = new Map();
    const masterArtistToId = new Map();

    for (const artistName of uniqueArtists) {
        const artistKey = normalizeLatin(artistName);
        if (!artistKey) continue;

        const latinMatch = index.search(artistKey)[0];
        const matchResult = latinMatch || index.search(normalize(artistName))[0];
        if (!matchResult) continue;

        const masterArtistId = matchResult.item.id;
        let outputArtistId = masterArtistToId.get(masterArtistId);
        if (outputArtistId === undefined) {
            const masterArtist = artists[masterArtistId];
            const outputArtist = {
                name: masterArtist.name_ko,
                name_en: masterArtist.name_en,
                instagram: masterArtist.instagram
            };
            if (Object.prototype.hasOwnProperty.call(masterArtist, 'country')) {
                outputArtist.country = masterArtist.country;
            }
            outputArtistId = matchedArtists.length;
            matchedArtists.push(outputArtist);
            masterArtistToId.set(masterArtistId, outputArtistId);
        }
        artistNameToId.set(artistKey, outputArtistId);
    }
    
    for (const event of events) {
        for (const name of event.artists || []) {
            const artistName = String(name).replaceAll('내한', '').trim();
            const artistKey = normalizeLatin(artistName);
            if (!artistName || artistNameToId.has(artistKey)) continue;
            if (!Object.prototype.hasOwnProperty.call(unmatchedArtists, artistName)) {
                unmatchedArtists[artistName] = [];
            }
            unmatchedArtists[artistName].push(event.eventUrl);
        }
    }
   
    const matchedEvents = events.map(event => ({ 
        ...event,
        artists: [...new Set((event.artists || []).map(name => {
            const artistName = String(name).replaceAll('내한', '').trim();
            const artistKey = normalizeLatin(artistName);
            return artistNameToId.has(artistKey) ? artistNameToId.get(artistKey) : artistName;
        }).filter(Boolean))]
    }));

    return { matchedEvents, matchedArtists, unmatchedArtists };
}


module.exports = { matchEventsToArtists, normalize };
