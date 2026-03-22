import { fetchWinamaxLiveData } from '../../utils/winamax/live'

export default defineEventHandler(async (event) => {
  try {
    const liveData = await fetchWinamaxLiveData()

    return {
      success: true,
      data: liveData,
    }
  } catch (error) {
    console.error('Error fetching Winamax live data:', error)
    return {
      success: false,
      message: 'Failed to fetch live data from Winamax.',
      error: error instanceof Error ? error.message : String(error),
    }
  }
})
