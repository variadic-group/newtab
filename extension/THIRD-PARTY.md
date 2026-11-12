# Third-party code

## SunCalc

`sky.js` computes the positions of the sun and the moon with formulas ported from
[SunCalc](https://github.com/mourner/suncalc). Its licence, as its `LICENSE` file read on
2026-11-11:

```
Copyright (c) 2026, Volodymyr Agafonkin
All rights reserved.

Redistribution and use in source and binary forms, with or without modification, are
permitted provided that the following conditions are met:

   1. Redistributions of source code must retain the above copyright notice, this list of
      conditions and the following disclaimer.

   2. Redistributions in binary form must reproduce the above copyright notice, this list
      of conditions and the following disclaimer in the documentation and/or other materials
      provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY
EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE
COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION)
HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR
TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

## Services the page calls

These are not bundled; the page asks them for data. What each one receives is in `PRIVACY.md`.

- [National Weather Service API](https://www.weather.gov/documentation/services-web-api) and
  radar images: United States government data, in the public domain.
- [BigDataCloud's free client-side reverse geocoding API](https://www.bigdatacloud.com/docs/api/free-reverse-geocode-to-city-api),
  asked without coordinates for the city this network connection appears to be in, only when
  the computer won't give its own location. No key; client-side use only, under its fair use
  policy (checked 2026-11-11).
- Cloudflare's trace page (`1.1.1.1/cdn-cgi/trace`) and the measurement endpoints its own
  [speed test](https://github.com/cloudflare/speedtest) uses (`speed.cloudflare.com/meta`,
  `/__down`, `/__up`), and the STUN servers of Cloudflare and Google, for the checks on the
  Tools tab. Called only when a check is pressed (checked 2026-11-11).
- [Nominatim](https://nominatim.org/), for the city search: data © OpenStreetMap contributors,
  under the [ODbL](https://www.openstreetmap.org/copyright).
- Google's icon service (`google.com/s2/favicons`) and product icons (`gstatic.com`), for the
  site icons on tiles. The icons belong to their sites.
