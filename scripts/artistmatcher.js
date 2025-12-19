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
        .replace(/[^가-힣a-zA-Z0-9\s]/g, '')
        .normalize("NFKD")  // decomposes hangul to jamo
        .toLowerCase()
        .replace(/([\u0041-\u007A])[\u0300-\u036f]+/g, '$1')  // latin diacritics
        .replace(/\s+/g, '')  // whitespace
        .normalize("NFC")   // recompose here for hangul.disassemble
}

function buildFuseIndex(artists) {
    return new Fuse(
        artists.map((v, i) => ({
            id: i,
            key: `${i}_${v.name_ko}_${v.name_en}`,
            name: normalize(v.name_ko),
            name_en: v.name_en?.toLowerCase().normalize().replace(/ /g, ''),
            name_rom: v.name_rom?.toLowerCase().normalize().replace(/ /g, ''),
            aliases: v.alias?.map(a => normalize(a)) || [],
            nameJamo: hangul.disassemble(normalize(v.name_ko)),
            aliasesJamo: (v.aliases || []).map(a => hangul.disassemble(normalize(a))),
        })), {
        keys: [
            { name: 'name', weight: 0.7 },
            { name: 'name_en', weight: 0.7 },
            { name: 'name_rom', weight: 0.4 },
            { name: 'aliases', weight: 0.1 },
            { name: 'nameJamo', weight: 0.2 },
            { name: 'aliasesJamo', weight: 0.02 }
        ],
        // tokenize: true,
        // matchAllTokens: true,
        threshold: 0.4,
        ignoreLocation: true,
        shouldSort: true,
        distance: 300
    });
}

function getArtistList() {
    return JSON.parse(fs.readFileSync(path.resolve(__dirname, 'artists.json')));
}

// TODO
// save list of unique matched artists, store in data file e.g.
// {
//   artists: [ ... ],
//   geojson: { ... }
// }
// Overwrite actual artist array with indexes for matched artists
// in frontend, just check if artists is numeric or str
async function matchEventsToArtists(events) {
    const artists = getArtistList();
    const index = buildFuseIndex(artists);

    const uniqueArtists = new Set();
    for (const event of events) {
        for (const artistName of event.artists) {
            if (artistName.includes("내한")) continue;
            uniqueArtists.add(artistName);
        }
    }

    const matchedArtists = [];
    const unmatchedArtists = {};
    const artistToId = new Map();
    let currentId = 0;

    for (const artistName of uniqueArtists) {
        if (!artistToId.has(artistName)) {
            const matchResult = index.search(artistName)[0] || null;
            if (matchResult) {
                matchedArtists.push({
                    name: artists[matchResult.item.id].name_ko,
                    name_en: artists[matchResult.item.id].name_en,
                    instagram: artists[matchResult.item.id].instagram 
                });
                artistToId.set(artistName, currentId++);
            }
        }
    }
    
    for (const event of events) {
        for (const artistName of event.artists) {
            if (!artistToId.has(artistName)) {
                if (unmatchedArtists.hasOwnProperty(artistName)) {
                    unmatchedArtists[artistName].push(event.eventUrl);
                } else {
                    unmatchedArtists[artistName] = [event.eventUrl];
                }
            }
        }
    }
   
    const matchedEvents = events.map(event => ({ 
        ...event,
        artists: event.artists.map(name => (artistToId.has(name)) ? artistToId.get(name) : name)
    }));

    return { matchedEvents, matchedArtists, unmatchedArtists };
}


module.exports = { matchEventsToArtists };