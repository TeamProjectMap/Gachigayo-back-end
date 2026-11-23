package com.baegopa.onestep.service.impl;

import com.baegopa.onestep.dto.GuardianTripDTO;
import com.baegopa.onestep.dto.NotificationDTO;
import com.baegopa.onestep.dto.NotificationDetailDTO;
import com.baegopa.onestep.dto.RouteStepDTO;
import com.baegopa.onestep.dto.TripLocationDTO;
import com.baegopa.onestep.dto.UserDTO;
import com.baegopa.onestep.mapper.IGuardianMapper;
import com.baegopa.onestep.service.IGuardianService;
import com.baegopa.onestep.service.IKakaoMapService;
import com.baegopa.onestep.util.GeoUtil;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class GuardianService implements IGuardianService {

    /** 홈 화면에 보여줄 최근 알림 개수 */
    private static final int NOTIFICATION_LIST_SIZE = 3;

    /** 알림 목록 화면에서 한 번에 보여줄 개수 */
    private static final int NOTIFICATION_PAGE_SIZE = 50;

    private static final DateTimeFormatter TIME_FORMAT = DateTimeFormatter.ofPattern("HH:mm");

    private static final DateTimeFormatter DATE_TIME_FORMAT = DateTimeFormatter.ofPattern("M월 d일 HH:mm");

    private final IGuardianMapper guardianMapper;
    private final IKakaoMapService kakaoMapService;

    @Override
    public Map<String, Object> getHomeInfo(Long guardianId) {
        Map<String, Object> homeInfo = new HashMap<>();

        UserDTO linkedUser = guardianMapper.getLinkedUser(guardianId);

        if (linkedUser == null) {
            homeInfo.put("linked", false);
            homeInfo.put("moving", false);
            homeInfo.put("notifications", new ArrayList<>());
            homeInfo.put("unreadCount", 0);
            return homeInfo;
        }

        homeInfo.put("linked", true);
        homeInfo.put("linkedUserId", linkedUser.getUserId());
        homeInfo.put("linkedUserName", linkedUser.getUserName());
        homeInfo.put("linkedUserPhone", linkedUser.getPhone());

        putTripInfo(homeInfo, linkedUser.getUserId());

        homeInfo.put("notifications", getNotifications(guardianId, NOTIFICATION_LIST_SIZE));
        homeInfo.put("unreadCount", guardianMapper.getUnreadNotificationCount(guardianId));

        return homeInfo;
    }

    @Override
    @Transactional
    public int markNotificationsRead(Long guardianId) {
        return guardianMapper.updateNotificationsRead(guardianId);
    }

    @Override
    public Map<String, Object> getLiveInfo(Long guardianId) {
        Map<String, Object> result = getHomeInfo(guardianId);

        if (!Boolean.TRUE.equals(result.get("moving"))) {
            return result;
        }

        Object tripId = result.get("tripId");

        if (tripId instanceof Long) {
            result.put("steps", toMapPoints((Long) tripId));
        }

        // 홈에서는 "약 15분 남음"이면 되지만, 여기서는 몇 시에 도착하는지도 보여준다
        Object remainMinutes = result.get("remainMinutes");

        if (remainMinutes instanceof Integer) {
            result.put("arrivalTime",
                    LocalDateTime.now().plusMinutes((Integer) remainMinutes).format(TIME_FORMAT));
        }

        return result;
    }

    /**
     * 지도에 찍을 구간들.
     * 아직 걸으며 기록하지 않은 구간은 좌표가 없어 지도에 그릴 수 없으므로 뺀다.
     */
    private List<Map<String, Object>> toMapPoints(Long tripId) {
        List<Map<String, Object>> points = new ArrayList<>();

        for (RouteStepDTO step : guardianMapper.getTripRouteSteps(tripId)) {
            if (step.getLat() == null || step.getLng() == null) {
                continue;
            }

            Map<String, Object> point = new LinkedHashMap<>();
            point.put("stepOrder", step.getStepOrder());
            point.put("lat", step.getLat());
            point.put("lng", step.getLng());
            point.put("checkpointName", step.getCheckpointName());
            point.put("mainText", step.getMainText());
            points.add(point);
        }

        return points;
    }

    @Override
    public Map<String, Object> getNotificationList(Long guardianId) {
        Map<String, Object> result = new HashMap<>();

        UserDTO linkedUser = guardianMapper.getLinkedUser(guardianId);

        // 알림 문구에 이용자 이름
        if (linkedUser != null) {
            result.put("linkedUserName", linkedUser.getUserName());
            result.put("linkedUserPhone", linkedUser.getPhone());
        }

        result.put("notifications", getNotifications(guardianId, NOTIFICATION_PAGE_SIZE));

        return result;
    }

    @Override
    @Transactional
    public Map<String, Object> getNotificationDetail(Long guardianId, Long notificationId) {
        NotificationDetailDTO detail = guardianMapper.getNotificationDetail(notificationId, guardianId);

        if (detail == null) {
            throw new IllegalArgumentException("알림을 찾을 수 없습니다.");
        }

        Map<String, Object> result = new HashMap<>();
        result.put("notificationId", detail.getNotificationId());
        result.put("notifyType", detail.getNotifyType());
        result.put("content", detail.getContent());
        result.put("destination", detail.getDestination());

        LocalDateTime occurredAt = detail.getEventDt() == null ? detail.getRegDt() : detail.getEventDt();
        result.put("time", formatTime(occurredAt));
        result.put("timeText", formatTimeText(occurredAt));

        if (detail.getLat() != null && detail.getLng() != null) {
            result.put("lat", detail.getLat());
            result.put("lng", detail.getLng());
            result.put("address", kakaoMapService.searchAddressByCoordinate(
                    detail.getLng().toPlainString(), detail.getLat().toPlainString()));
        }

        UserDTO linkedUser = guardianMapper.getLinkedUser(guardianId);
        if (linkedUser != null) {
            result.put("linkedUserName", linkedUser.getUserName());
            result.put("linkedUserPhone", linkedUser.getPhone());
        }

        return result;
    }

    @Override
    @Transactional
    public int markNotificationRead(Long guardianId, Long notificationId) {
        return guardianMapper.updateNotificationRead(notificationId, guardianId);
    }

    /**
     * 이용자가 이동 중이면 이동 정보를 담고, 아니면 moving = false 만 담는다.
     */
    private void putTripInfo(Map<String, Object> homeInfo, Long userId) {
        GuardianTripDTO trip = guardianMapper.getOngoingTrip(userId);

        if (trip == null) {
            homeInfo.put("moving", false);
            return;
        }

        homeInfo.put("moving", true);
        homeInfo.put("tripId", trip.getTripId());
        homeInfo.put("startName", trip.getStartName());
        homeInfo.put("endName", trip.getEndName());
        homeInfo.put("nextCheckpointName", trip.getNextCheckpointName());

        TripLocationDTO location = guardianMapper.getLatestTripLocation(trip.getTripId());

        // 다음 체크포인트까지 거리: 이용자 현재 위치에서 체크포인트까지 (위치를 모르면 null → "거리 정보 없음")
        homeInfo.put("nextCheckpointDistance", hasPoint(location)
                && trip.getNextCheckpointLat() != null && trip.getNextCheckpointLng() != null
                ? (int) Math.round(GeoUtil.distanceMeters(location.getLat(), location.getLng(),
                        trip.getNextCheckpointLat(), trip.getNextCheckpointLng()))
                : null);
        homeInfo.put("remainMinutes", calculateRemainMinutes(trip, location));

        if (location != null) {
            homeInfo.put("currentLat", location.getLat());
            homeInfo.put("currentLng", location.getLng());
            homeInfo.put("locationTime", formatTime(location.getRegDt()));

            // 위치 이름은 저장하지 않고 볼 때마다 좌표를 주소로 바꾼다 (실패하면 null)
            homeInfo.put("currentPlaceName", searchAddress(location));
        }
    }

    /**
     * 좌표 -> 주소. 카카오는 x가 경도, y가 위도다.
     */
    private String searchAddress(TripLocationDTO location) {
        if (location.getLat() == null || location.getLng() == null) {
            return null;
        }

        return kakaoMapService.searchAddressByCoordinate(
                location.getLng().toPlainString(), location.getLat().toPlainString());
    }

    /** 목적지에서 이만큼 안이면 "곧 도착" */
    private static final double NEAR_DESTINATION_METERS = 100;

    /** 직선거리를 실제 길 거리로 어림할 때 곱하는 값 (길은 직선보다 돌아간다) */
    private static final double ROAD_DETOUR = 1.3;

    /** 경로 평균 속도를 모를 때 쓰는 걷는 속도(m/s) */
    private static final double WALKING_SPEED = 1.1;

    /**
     * 남은 시간(분)
     * <p>
     * 이용자의 현재 위치와 목적지를 알면 남은 거리로 계산한다.
     * (남은 직선거리 × 1.3) ÷ 이 경로의 평균 속도(전체 거리 ÷ 전체 시간, 대중교통 포함)
     * 그래서 예상보다 늦어져도 멀리 있으면 "곧 도착"이 되지 않는다.
     * 위치나 목적지를 모르면 예전처럼 (출발 시각 + 경로 전체 예상 시간) - 지금 으로 계산한다.
     * 0이면 화면에서 "곧 도착"으로 표시한다.
     */
    private Integer calculateRemainMinutes(GuardianTripDTO trip, TripLocationDTO location) {
        if (hasPoint(location) && trip.getEndLat() != null && trip.getEndLng() != null) {
            double remainMeters = GeoUtil.distanceMeters(location.getLat(), location.getLng(),
                    trip.getEndLat(), trip.getEndLng());

            if (remainMeters <= NEAR_DESTINATION_METERS) {
                return 0;
            }

            double speed = WALKING_SPEED;
            if (trip.getTotalDistance() != null && trip.getTotalDistance() > 0
                    && trip.getTotalDuration() != null && trip.getTotalDuration() > 0) {
                speed = Math.max(WALKING_SPEED, trip.getTotalDistance() / (double) trip.getTotalDuration());
            }

            // 멀리 있으면 적어도 1분
            return Math.max(1, (int) Math.round(remainMeters * ROAD_DETOUR / speed / 60.0));
        }

        if (trip.getStartDt() == null || trip.getTotalDuration() == null) {
            return null;
        }

        LocalDateTime expectedArrival = trip.getStartDt().plusSeconds(trip.getTotalDuration());
        long remainSeconds = Duration.between(LocalDateTime.now(), expectedArrival).getSeconds();

        if (remainSeconds <= 0) {
            return 0;
        }

        // 30초 이상 남았으면 1분으로 올려서 보여준다
        return (int) Math.round(remainSeconds / 60.0);
    }

    private static boolean hasPoint(TripLocationDTO location) {
        return location != null && location.getLat() != null && location.getLng() != null;
    }

    private List<Map<String, Object>> getNotifications(Long guardianId, int listSize) {
        List<NotificationDTO> notifications =
                guardianMapper.getRecentNotifications(guardianId, listSize);

        List<Map<String, Object>> list = new ArrayList<>();

        for (NotificationDTO notification : notifications) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("notificationId", notification.getNotificationId());
            item.put("notifyType", notification.getNotifyType());
            item.put("content", notification.getContent());
            item.put("readYn", notification.getReadYn());
            item.put("time", formatTime(notification.getRegDt()));
            item.put("timeText", formatTimeText(notification.getRegDt()));
            list.add(item);
        }

        return list;
    }

    private String formatTime(LocalDateTime dateTime) {
        return dateTime == null ? null : dateTime.format(TIME_FORMAT);
    }

    /**
     * 알림 목록에 쓰는 시각 표기
     */
    private String formatTimeText(LocalDateTime dateTime) {
        if (dateTime == null) {
            return null;
        }

        LocalDateTime now = LocalDateTime.now();
        long minutes = Duration.between(dateTime, now).toMinutes();

        if (minutes < 1) {
            return "방금 전";
        }

        if (minutes < 60) {
            return minutes + "분 전";
        }

        LocalDate today = now.toLocalDate();
        LocalDate date = dateTime.toLocalDate();

        if (date.isEqual(today)) {
            return "오늘 " + dateTime.format(TIME_FORMAT);
        }

        if (date.isEqual(today.minusDays(1))) {
            return "어제 " + dateTime.format(TIME_FORMAT);
        }

        return dateTime.format(DATE_TIME_FORMAT);
    }
}
