package com.baegopa.onestep.service;

import com.baegopa.onestep.dto.WeatherDTO;

public interface IWeatherService {
    WeatherDTO getWeather(WeatherDTO pDTO) throws Exception;
}