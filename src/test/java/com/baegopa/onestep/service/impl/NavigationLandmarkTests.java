package com.baegopa.onestep.service.impl;

import com.baegopa.onestep.dto.*;
import com.baegopa.onestep.mapper.*;
import com.baegopa.onestep.service.IPhotoStorage;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import java.math.BigDecimal;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class NavigationLandmarkTests {
    @Test void deniesOtherUsersTripBeforeReadingPhotos() {
        var trips = mock(ITripMapper.class); var routes = mock(IRouteMapper.class); var photos = mock(IRoutePhotoMapper.class);
        var trip = new TripDTO(); trip.setUserId(9L); when(trips.getTrip(1L)).thenReturn(trip);
        assertThrows(IllegalArgumentException.class, () -> new NavigationLandmarkService(trips, routes, photos).getLandmarks(7L, 1L));
        verifyNoInteractions(routes, photos);
    }

    @Test void onlyReturnsLocatedPhotosFromOwnedGuardianRouteWithoutStorageKeys() {
        var trips = mock(ITripMapper.class); var routes = mock(IRouteMapper.class); var photos = mock(IRoutePhotoMapper.class);
        var trip = new TripDTO(); trip.setUserId(7L); trip.setRouteId(2L); when(trips.getTrip(1L)).thenReturn(trip);
        var route = new RouteDTO(); route.setUserId(7L); route.setRouteId(2L); route.setRouteType("GUARDIAN"); when(routes.getRoute(2L)).thenReturn(route);
        var located = new RoutePhotoDTO(); located.setRoutePhotoId(5L); located.setPhotoUrl("/uploads/photo.jpg");
        located.setLat(new BigDecimal("37.56")); located.setLng(new BigDecimal("126.97")); located.setStorageKey("private-key");
        when(photos.getPhotosByRoute(2L)).thenReturn(List.of(located, new RoutePhotoDTO()));
        var result = new NavigationLandmarkService(trips, routes, photos).getLandmarks(7L, 1L);
        assertEquals(1, result.size()); assertEquals(5L, result.get(0).id());
        assertFalse(result.get(0).toString().contains("private-key"));
        route.setRouteType("RECOMMENDED"); assertTrue(new NavigationLandmarkService(trips, routes, photos).getLandmarks(7L, 1L).isEmpty());
    }

    @Test void preventsFourthPhotoAcrossDifferentStepsBeforeWritingAFile() {
        var photos = mock(IRoutePhotoMapper.class); var routes = mock(IRouteMapper.class);
        var links = mock(ILinkMapper.class); var storage = mock(IPhotoStorage.class);
        var user = new UserDTO(); user.setUserId(7L); when(links.getUserByGuardianId(9L)).thenReturn(user);
        var route = new RouteDTO(); route.setRouteId(2L); route.setUserId(7L);
        when(routes.getRoute(2L)).thenReturn(route); when(routes.lockRoute(2L)).thenReturn(route);
        var step = new RouteStepDTO(); step.setRouteId(2L); step.setRouteStepId(10L); step.setStepType("WALK");
        when(routes.getRouteStep(10L)).thenReturn(step);
        when(photos.getPhotosByRoute(2L)).thenReturn(List.of(new RoutePhotoDTO(), new RoutePhotoDTO(), new RoutePhotoDTO()));
        var service = new RoutePhotoService(photos, routes, links, storage);
        var file = new MockMultipartFile("photo", "landmark.jpg", "image/jpeg", new byte[]{1,2,3});
        assertThrows(IllegalArgumentException.class, () -> service.addPhoto(9L, 10L, file, "name", "description", null, null));
        verify(routes).lockRoute(2L); verifyNoInteractions(storage); verify(photos, never()).insertPhoto(any());
        assertEquals(0, service.getStepPhotos(9L, 10L).get("maxPhotos"));
    }
}
