package com.baegopa.onestep.service.impl;

import com.baegopa.onestep.dto.GuardianTripDTO;
import com.baegopa.onestep.dto.NotificationDTO;
import com.baegopa.onestep.dto.NotificationDetailDTO;
import com.baegopa.onestep.dto.TripLocationDTO;
import com.baegopa.onestep.dto.UserDTO;
import com.baegopa.onestep.mapper.IGuardianMapper;
import com.baegopa.onestep.service.IGuardianService;
import com.baegopa.onestep.service.IKakaoMapService;
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
    public Map<String, Object> getNotificationList(Long guardianId) {
        Map<String, Object> result = new HashMap<>();

        UserDTO linkedUser = guardianMapper.getLinkedUser(guardianId);

        // 알림 문구에 이용자 이름
        if (linkedUser != null) {
            result.put("linkedUserName", linkedUser.getUserName());
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
        homeInfo.put("nextCheckpointDistance", trip.getNextCheckpointDistance());
        homeInfo.put("remainMinutes", calculateRemainMinutes(trip));

        TripLocationDTO location = guardianMapper.getLatestTripLocation(trip.getTripId());

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

    /**
     * 남은 시간(분) = (출발 시각 + 경로 전체 예상 시간) - 지금
     * 아직 TRIPS에 "예상 도착 시각" 컬럼이 없어 ROUTES.totalDuration으로 계산
     * 이미 지났으면 0을 돌려주고 화면에서 "곧 도착"으로 표시
     */
    private Integer calculateRemainMinutes(GuardianTripDTO trip) {
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
