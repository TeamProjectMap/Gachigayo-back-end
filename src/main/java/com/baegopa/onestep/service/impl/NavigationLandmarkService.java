package com.baegopa.onestep.service.impl;

import com.baegopa.onestep.dto.RouteDTO;
import com.baegopa.onestep.dto.TripDTO;
import com.baegopa.onestep.mapper.IRouteMapper;
import com.baegopa.onestep.mapper.IRoutePhotoMapper;
import com.baegopa.onestep.mapper.ITripMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.List;

/** Reads landmarks from the route already assigned to this user's trip. */
@Service
@RequiredArgsConstructor
public class NavigationLandmarkService {
    private final ITripMapper tripMapper;
    private final IRouteMapper routeMapper;
    private final IRoutePhotoMapper photoMapper;

    public List<Landmark> getLandmarks(Long userId, Long tripId) {
        TripDTO trip = tripMapper.getTrip(tripId);
        if (trip == null || !userId.equals(trip.getUserId())) {
            throw new IllegalArgumentException("이동 정보를 찾을 수 없습니다.");
        }
        RouteDTO route = routeMapper.getRoute(trip.getRouteId());
        if (route == null || !userId.equals(route.getUserId()) || !"GUARDIAN".equals(route.getRouteType())) {
            return List.of();
        }
        return photoMapper.getPhotosByRoute(route.getRouteId()).stream()
                .filter(photo -> photo.getLat() != null && photo.getLng() != null)
                .map(photo -> new Landmark(photo.getRoutePhotoId(), photo.getPhotoUrl(), photo.getTitle(),
                        photo.getDescription(), photo.getLat(), photo.getLng()))
                .toList();
    }

    public record Landmark(Long id, String photoUrl, String title, String description,
                           BigDecimal latitude, BigDecimal longitude) { }
}
