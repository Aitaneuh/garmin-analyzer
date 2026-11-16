/** Decode a Google encoded polyline (Strava summary_polyline) into [lat, lng] pairs. */
export function decodePolyline(str: string, precision = 5): [number, number][] {
  const factor = 10 ** precision
  const coords: [number, number][] = []
  let index = 0
  let lat = 0
  let lng = 0
  while (index < str.length) {
    for (const which of [0, 1]) {
      let result = 0
      let shift = 0
      let byte: number
      do {
        byte = str.charCodeAt(index++) - 63
        result |= (byte & 0x1f) << shift
        shift += 5
      } while (byte >= 0x20)
      const delta = result & 1 ? ~(result >> 1) : result >> 1
      if (which === 0) lat += delta
      else lng += delta
    }
    coords.push([lat / factor, lng / factor])
  }
  return coords
}
