/**
 * Fetch event data from RA
 */

const endpoint = 'https://ra.co/graphql';
const headers = {
  'authority': 'ra.co',
  'accept': '*/*',
  'content-type': 'application/json',
  'origin': 'https://ra.co',
  'referer': 'https://ra.co/events/kr/all',
  'ra-content-language': 'en',
  'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36'
};
const query = `
  query GET_EVENT_LISTINGS(
    $filters: FilterInputDtoInput
    $filterOptions: FilterOptionsInputDtoInput
    $page: Int
    $pageSize: Int
  ) {
    eventListings(
      filters: $filters
      filterOptions: $filterOptions
      pageSize: $pageSize
      page: $page
    ) {
      data {
        listingDate
        event {
          title
          date
          startTime
          endTime
          contentUrl
          venue {
            name
            contentUrl
          }
          artists {
            name
          }
          images {
            filename
            type
          }
        }
      }
      totalResults
    }
  }
`;

async function fetchRAEvents(startDate, endDate, pageSize = 100, area = 75, maxPages = 20) {
  const allResults = [];
  let page = 1;
  while (page <= maxPages) {
    const variables = {
      filters: {
        areas: { eq: area },
        listingDate: {
          gte: new Date(startDate).toISOString(),
          lte: new Date(endDate).toISOString()
        }
      },
      pageSize: pageSize,
      page: page
    };
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({ query, variables })
    });
    if (!response.ok) {
      throw new Error(`RA request failed (${response.status} ${response.statusText})`);
    }
    const json = await response.json();
    if (json.errors?.length) {
      throw new Error(`RA GraphQL request failed: ${json.errors.map(error => error.message).join('; ')}`);
    }
    const eventListings = json?.data?.eventListings;
    if (!Array.isArray(eventListings?.data) || !Number.isFinite(eventListings.totalResults)) {
      throw new Error('RA returned an invalid event listings response');
    }
    const listings = eventListings.data;
    allResults.push(...listings);
    if (allResults.length >= eventListings.totalResults) {
      break;
    }
    if (listings.length === 0) {
      throw new Error(`RA pagination ended after ${allResults.length} of ${eventListings.totalResults} listings`);
    }
    if (page === maxPages) {
      throw new Error(`RA has more than the configured page limit of ${maxPages}`);
    }
    page++;
  }

  return allResults.map(event => {
    let venueUrl = event.event.venue?.contentUrl;
    let data = {
      date: event.listingDate.trim(),
      startTime: event.event.startTime.trim(),
      endTime: event.event.endTime.trim(),
      eventUrl: `https://ra.co${event.event.contentUrl}`,
      title: event.event.title.trim(),
      location: event.event.venue?.name,
      artists: event.event.artists.map(a => a.name),
      source: 'ra'
    };
    if (venueUrl) {
      data.ra_id = parseInt(venueUrl.replace('/clubs/', ''));
    }
    return data;
  });
}

module.exports = { fetchRAEvents }
