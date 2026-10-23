
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import './App.css'

type Place = {
  name: string
  country?: string
  latitude: number
  longitude: number
}

type WeatherData = {
  current: {
    temperature_2m: number
    relative_humidity_2m: number
    wind_speed_10m: number
    weather_code: number
  }
  daily: {
    time: string[]
    temperature_2m_max: number[]
    temperature_2m_min: number[]
    weather_code: number[]
  }
}

const CITY_NOT_FOUND =
  'City not found. Please check the spelling and try again.'

function getDescription(code: number) {
  if (code === 0) return 'Clear sky'
  if (code <= 3) return 'Partly cloudy'
  if (code <= 48) return 'Foggy'
  if (code <= 57) return 'Drizzle'
  if (code <= 67) return 'Rainy'
  if (code <= 77) return 'Snowy'
  if (code <= 82) return 'Rain showers'
  if (code <= 86) return 'Snow showers'
  if (code <= 99) return 'Thunderstorms'
  return 'Unknown conditions'
}

function getIcon(code: number) {
  if (code === 0) return '☀️'
  if (code <= 3) return '🌤️'
  if (code <= 48) return '🌫️'
  if (code <= 67) return '🌧️'
  if (code <= 77) return '❄️'
  if (code <= 82) return '🌦️'
  if (code <= 86) return '🌨️'
  return '⛈️'
}

// Search for a city using Open-Meteo.
// Use Photon if the first service fails or times out.
async function findCity(name: string): Promise<Place> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 2000)

  try {
    const response = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1`,
      { signal: controller.signal }
    )

    if (!response.ok) {
      throw new Error('Geocoding service unavailable')
    }

    const data = await response.json()
    const place = data.results?.[0]

    if (!place) {
      throw new Error(CITY_NOT_FOUND)
    }

    return {
      name: place.name,
      country: place.country,
      latitude: place.latitude,
      longitude: place.longitude,
    }
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === CITY_NOT_FOUND
    ) {
      throw error
    }

    const response = await fetch(
      `https://photon.komoot.io/api/?q=${encodeURIComponent(name)}&limit=1&layer=city`
    )

    if (!response.ok) {
      throw new Error('Could not search for the city. Try again.')
    }

    const data = await response.json()
    const feature = data.features?.[0]

    if (!feature) {
      throw new Error(CITY_NOT_FOUND)
    }

    return {
      name: feature.properties.name || name,
      country: feature.properties.country,
      longitude: feature.geometry.coordinates[0],
      latitude: feature.geometry.coordinates[1],
    }
  } finally {
    clearTimeout(timeout)
  }
}

function App() {
  const [cityInput, setCityInput] = useState('')
  const [city, setCity] = useState('Lagos')
  const [locationName, setLocationName] = useState('')
  const [weather, setWeather] = useState<WeatherData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    let cancelled = false

    async function loadWeather() {
      setLoading(true)
      setError('')
      setWeather(null)

      try {
        const place = await findCity(city)

        const params = new URLSearchParams({
          latitude: String(place.latitude),
          longitude: String(place.longitude),
          current:
            'temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code',
          daily:
            'temperature_2m_max,temperature_2m_min,weather_code',
          forecast_days: '4',
          timezone: 'auto',
        })

        const response = await fetch(
          `https://api.open-meteo.com/v1/forecast?${params}`
        )

        if (!response.ok) {
          throw new Error('Weather service is unavailable. Try again.')
        }

        const data: WeatherData = await response.json()

        if (!cancelled) {
          setWeather(data)
          setLocationName(
            `${place.name}${place.country ? ', ' + place.country : ''}`
          )
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : 'Something went wrong. Please try again.'
          )
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadWeather()

    return () => {
      cancelled = true
    }
  }, [city, retryCount])

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const name = cityInput.trim()
    if (!name) return

    setCity(name)
    setRetryCount((count) => count + 1)
  }

  return (
    <main className="app">
      <header className="header">
        <div className="brand">
          <span className="brand-icon">☀️</span>
          <span>Weatherly</span>
        </div>
        <span className="source">Powered by Open-Meteo</span>
      </header>

      <section className="search-section">
        <h1>Your daily weather</h1>
        <p>
          Find current conditions and the forecast for any city.
        </p>

        <form className="search-form" onSubmit={handleSearch}>
          <input
            type="text"
            aria-label="Search city"
            placeholder="Enter a city, e.g. Lagos"
            value={cityInput}
            onChange={(event) => setCityInput(event.target.value)}
          />
          <button type="submit" disabled={loading || !cityInput.trim()}>
            Search
          </button>
        </form>
      </section>

      {loading && (
        <p className="status" role="status">
          Loading weather...
        </p>
      )}

      {!loading && error && (
        <section className="error-card" role="alert">
          <h2>
            {error === CITY_NOT_FOUND
              ? 'City not found'
              : 'Weather unavailable'}
          </h2>
          <p>{error}</p>
          <button
            type="button"
            onClick={() => setRetryCount((count) => count + 1)}
          >
            Try again
          </button>
        </section>
      )}

      {!loading && weather && (
        <>
          <section className="current-card">
            <div>
              <p className="eyebrow">CURRENT WEATHER</p>
              <h2>{locationName}</h2>
              <p className="condition">
                {getDescription(weather.current.weather_code)}
              </p>
              <div className="temperature">
                {Math.round(weather.current.temperature_2m)}°C
              </div>
            </div>

            <div className="weather-icon" aria-hidden="true">
              {getIcon(weather.current.weather_code)}
            </div>

            <div className="weather-details">
              <div>
                <span>Humidity</span>
                <strong>
                  {weather.current.relative_humidity_2m}%
                </strong>
              </div>
              <div>
                <span>Wind speed</span>
                <strong>
                  {weather.current.wind_speed_10m} km/h
                </strong>
              </div>
            </div>
          </section>

          <section className="forecast-section">
            <h2>Today and the next 3 days</h2>

            <div className="forecast-grid">
              {weather.daily.time.slice(0, 4).map((date, index) => (
                <article className="forecast-card" key={date}>
                  <h3>
                    {index === 0
                      ? 'Today'
                      : new Date(`${date}T12:00:00`).toLocaleDateString(
                          'en',
                          { weekday: 'long' }
                        )}
                  </h3>

                  <span className="forecast-icon" aria-hidden="true">
                    {getIcon(weather.daily.weather_code[index])}
                  </span>

                  <p>
                    {getDescription(weather.daily.weather_code[index])}
                  </p>

                  <div className="temperatures">
                    <strong>
                      {Math.round(
                        weather.daily.temperature_2m_max[index]
                      )}°
                    </strong>
                    <span>
                      {Math.round(
                        weather.daily.temperature_2m_min[index]
                      )}°
                    </span>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </>
      )}

      <footer>Weather data provided by Open-Meteo</footer>
    </main>
  )
}

export default App
