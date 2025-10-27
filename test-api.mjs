import { DefaultApi, Configuration } from 'arkturian-oneal-sdk';

const config = new Configuration({
  basePath: 'https://oneal-api.arkturian.com/v1',
  apiKey: 'oneal_demo_token'
});

const api = new DefaultApi(config);

try {
  console.log('Testing API call...');
  const response = await api.productsGet({ limit: 5 });
  console.log('✅ API Response:', {
    status: response.status,
    hasData: !!response.data,
    results: response.data.results?.length || 0
  });
  
  if (response.data.results && response.data.results.length > 0) {
    console.log('Sample product:', response.data.results[0]);
  }
} catch (error) {
  console.error('❌ API Error:', error.message);
  if (error.response) {
    console.error('Response status:', error.response.status);
    console.error('Response data:', error.response.data);
  }
}
