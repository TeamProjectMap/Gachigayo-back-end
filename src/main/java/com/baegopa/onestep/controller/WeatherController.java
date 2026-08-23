package com.baegopa.onestep.controller;

import com.baegopa.onestep.dto.WeatherDTO;
import com.baegopa.onestep.service.IWeatherService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/weather")
@RequiredArgsConstructor
public class WeatherController {

    private final IWeatherService weatherService;

    @GetMapping("/getWeather")
    public WeatherDTO getWeather(@RequestParam(value = "lat") String lat,
                                 @RequestParam(value = "lon") String lon) throws Exception {

        WeatherDTO pDTO = new WeatherDTO();
        pDTO.setLat(lat);
        pDTO.setLon(lon);

        return weatherService.getWeather(pDTO);
    }
}