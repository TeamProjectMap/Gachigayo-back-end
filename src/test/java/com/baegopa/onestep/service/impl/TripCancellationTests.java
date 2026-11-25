package com.baegopa.onestep.service.impl;

import com.baegopa.onestep.controller.TripController;
import com.baegopa.onestep.dto.TripDTO;
import com.baegopa.onestep.mapper.*;
import com.baegopa.onestep.service.*;
import org.apache.ibatis.builder.xml.XMLMapperBuilder;
import org.apache.ibatis.session.Configuration;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.mock.web.MockHttpServletRequest;
import java.util.Map;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class TripCancellationTests {
    final ITripMapper trips = mock(ITripMapper.class);
    final INotificationService notifications = mock(INotificationService.class);
    final TripService service = new TripService(trips, mock(IRouteMapper.class), mock(IRoutePhotoMapper.class), notifications);
    TripDTO trip(long owner, String status) {
        var result = new TripDTO(); result.setTripId(21L); result.setUserId(owner); result.setTripStatus(status); return result;
    }
    @Test void endsOnlySelectedOwnedMovingTripWithoutArrivalOrNotification() {
        when(trips.getTrip(21L)).thenReturn(trip(7L, "MOVING"));
        service.cancel(7L, 21L);
        verify(trips).updateTripCancelled(7L, 21L);
        verify(trips, never()).updateOngoingTripsCancelled(any());
        verify(trips, never()).updateTripArrived(any());
        verifyNoInteractions(notifications);
    }
    @Test void completedAndCancelledTripsStayUnchangedOnRepeatedCancellation() {
        for (String status : new String[]{"CANCELLED", "ARRIVED"}) {
            when(trips.getTrip(21L)).thenReturn(trip(7L, status)); service.cancel(7L, 21L);
        }
        verify(trips, never()).updateTripCancelled(any(), any()); verifyNoInteractions(notifications);
    }
    @Test void rejectsAnotherUsersTrip() {
        when(trips.getTrip(21L)).thenReturn(trip(8L, "MOVING"));
        assertThrows(IllegalArgumentException.class, () -> service.cancel(7L, 21L));
        verify(trips, never()).updateTripCancelled(any(), any());
    }
    @Test void rejectsMissingOrUnknownTrip() {
        assertThrows(IllegalArgumentException.class, () -> service.cancel(7L, null));
        assertThrows(IllegalArgumentException.class, () -> service.cancel(7L, 999L));
        verify(trips, never()).updateTripCancelled(any(), any());
    }
    @Test void endpointUsesSessionOwnerAndRejectsGuardianOrMissingLogin() {
        var mocked = mock(ITripService.class);
        var controller = new TripController(mocked, mock(NavigationLandmarkService.class), mock(IRouteService.class), trips);
        var request = new MockHttpServletRequest(); request.setParameter("tripId", "21"); request.setParameter("userId", "8");
        var session = new MockHttpSession(); assertEquals(false, controller.cancel(request, session).get("success"));
        session.setAttribute("SS_USER_ID", 7L); session.setAttribute("SS_USER_ROLE", "GUARDIAN");
        assertEquals(false, controller.cancel(request, session).get("success")); verifyNoInteractions(mocked);
        session.setAttribute("SS_USER_ROLE", "USER"); assertEquals(true, controller.cancel(request, session).get("success"));
        verify(mocked).cancel(7L, 21L);
    }
    @Test void endpointReportsFailureRatherThanClaimingSuccess() {
        var mocked = mock(ITripService.class);
        doThrow(new IllegalArgumentException("이동 기록을 찾을 수 없습니다.")).when(mocked).cancel(7L, null);
        var controller = new TripController(mocked, mock(NavigationLandmarkService.class), mock(IRouteService.class), trips);
        var session = new MockHttpSession(); session.setAttribute("SS_USER_ID", 7L); session.setAttribute("SS_USER_ROLE", "USER");
        assertEquals(false, controller.cancel(new MockHttpServletRequest(), session).get("success"));
    }
    @Test void mapperLimitsCancellationToOneOwnedMovingTrip() throws Exception {
        var configuration = new Configuration();
        try (var input = getClass().getResourceAsStream("/mapper/TripMapper.xml")) {
            new XMLMapperBuilder(input, configuration, "mapper/TripMapper.xml", configuration.getSqlFragments()).parse();
        }
        var sql = configuration.getMappedStatement(ITripMapper.class.getName()+".updateTripCancelled")
            .getBoundSql(Map.of("tripId", 21L, "userId", 7L)).getSql().replaceAll("\\s+", " ");
        assertTrue(sql.contains("t.tripId = ? AND r.userId = ?"));
        assertTrue(sql.contains("t.tripStatus = 'MOVING'")); assertTrue(sql.contains("'CANCELLED'"));
    }
}
