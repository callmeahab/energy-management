import { ApolloClient, InMemoryCache, createHttpLink, gql } from '@apollo/client';
import { setContext } from '@apollo/client/link/context';

// Test energy points query with series data
const TEST_ENERGY_POINTS = gql`
  query TestEnergyPoints {
    buildings(filter: { id: { in: ["BLDG5o26DguWKu5T9nRvSYn5Em"] } }) {
      id
      name
      points(filter: { exactType: { in: ["Electric_Power_Sensor"] } }) {
        id
        name
        description
        exactType
        unit {
          name
        }
        series(latest: true) {
          timestamp
          value {
            float64Value
            float32Value
            stringValue
            boolValue
          }
        }
      }
    }
  }
`;

export async function testEnergyQuery() {
  const httpLink = createHttpLink({
    uri: process.env.NODE_ENV === 'production' 
      ? 'https://api.mapped.com/graphql'
      : 'http://localhost:3000/api/graphql',
    credentials: 'omit',
  });

  const authLink = setContext((_, { headers }) => {
    return {
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
    };
  });

  const client = new ApolloClient({
    link: authLink.concat(httpLink),
    cache: new InMemoryCache(),
    defaultOptions: {
      query: {
        errorPolicy: 'all',
        fetchPolicy: 'no-cache',
      },
    },
  });

  try {
    console.log('Testing energy points query...');
    const { data, errors } = await client.query({
      query: TEST_ENERGY_POINTS,
    });

    console.log('Query completed successfully');
    console.log('Buildings found:', data?.buildings?.length || 0);
    
    if (data?.buildings && data.buildings.length > 0) {
      const building = data.buildings[0];
      console.log('Building:', building.id, building.name);
      console.log('Electric power sensor points:', building.points?.length || 0);
      
      if (building.points && building.points.length > 0) {
        console.log('Sample power points:');
        building.points.slice(0, 5).forEach((point: any) => {
          console.log(`- ${point.name} (${point.exactType})`);
          console.log(`  Unit: ${point.unit?.name || 'N/A'}`);
          console.log(`  Latest series data: ${point.series?.length || 0} records`);
          if (point.series && point.series.length > 0) {
            const latest = point.series[0];
            const value = latest.value?.float64Value ?? latest.value?.float32Value ?? latest.value?.stringValue ?? latest.value?.boolValue;
            console.log(`  Latest value: ${value} at ${latest.timestamp}`);
          }
        });
      }
    }

    if (errors) {
      console.log('GraphQL errors:', errors);
    }

    return {
      success: true,
      data,
      errors
    };

  } catch (error) {
    console.error('Energy query test failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}