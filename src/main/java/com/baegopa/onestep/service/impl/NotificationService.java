package com.baegopa.onestep.service.impl;

import com.baegopa.onestep.dto.UserDTO;
import com.baegopa.onestep.dto.UserSettingsDTO;
import com.baegopa.onestep.mapper.ILinkMapper;
import com.baegopa.onestep.mapper.INotificationMapper;
import com.baegopa.onestep.mapper.ISettingsMapper;
import com.baegopa.onestep.service.INotificationService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Slf4j
@Service
@RequiredArgsConstructor
public class NotificationService implements INotificationService {

    private static final String NOTIFY_TYPE_ARRIVED = "ARRIVED";
    private static final String NOTIFY_TYPE_HELP_REQUEST = "HELP_REQUEST";

    /** 길안내가 도착 처리를 여러 번 불러도 알림은 한 번만 남긴다 */
    private static final int DUPLICATE_WINDOW_MINUTES = 10;

    private final INotificationMapper notificationMapper;
    private final ILinkMapper linkMapper;
    private final ISettingsMapper settingsMapper;

    @Override
    @Transactional
    public boolean createArrivedNotification(Long userId, String destinationName) {
        UserDTO guardian = linkMapper.getGuardianByUserId(userId);

        // 연결된 보호자가 없으면 알릴 곳이 없다
        if (guardian == null) {
            log.info("연결된 보호자가 없어 도착 알림을 만들지 않음 userId={}", userId);
            return false;
        }

        if (!isArrivalAlarmOn(guardian.getUserId())) {
            log.info("보호자가 꺼둔 알림이라 만들지 않음 guardianId={}", guardian.getUserId());
            return false;
        }

        // 목적지 이름이 알림 문구가 된다. 없으면 화면에서 "목적지에 도착했어요"로 보인다.
        String content = destinationName == null ? "" : destinationName.trim();

        if (notificationMapper.getRecentNotificationCount(
                guardian.getUserId(), NOTIFY_TYPE_ARRIVED, content, DUPLICATE_WINDOW_MINUTES) > 0) {
            log.info("최근에 같은 도착 알림이 있어 건너뜀 guardianId={}, content={}",
                    guardian.getUserId(), content);
            return false;
        }

        notificationMapper.insertNotification(guardian.getUserId(), NOTIFY_TYPE_ARRIVED, content, null);

        log.info("도착 알림 생성 userId={}, guardianId={}, content={}",
                userId, guardian.getUserId(), content);

        return true;
    }

    @Override
    @Transactional
    public boolean createHelpRequestNotification(Long userId, String helpMessage, Long helpRequestId) {
        UserDTO guardian = linkMapper.getGuardianByUserId(userId);

        if (guardian == null) {
            log.info("연결된 보호자가 없어 도움요청 알림을 만들지 않음 userId={}", userId);
            return false;
        }

        // 도움요청은 설정으로 끌 수 없고, 급할 때 여러 번 보낼 수 있어 중복도 막지 않는다
        String content = helpMessage == null ? "" : helpMessage.trim();

        notificationMapper.insertNotification(guardian.getUserId(), NOTIFY_TYPE_HELP_REQUEST, content, helpRequestId);

        log.info("도움요청 알림 생성 userId={}, guardianId={}", userId, guardian.getUserId());

        return true;
    }

    /**
     * 보호자의 "도착·체크포인트 알림" 설정을 본다.
     * 설정을 한 번도 저장한 적이 없으면 받는 것으로 본다. (테이블 기본값과 같다)
     */
    private boolean isArrivalAlarmOn(Long guardianId) {
        UserSettingsDTO settings = settingsMapper.getUserSettings(guardianId);

        return settings == null || "Y".equals(settings.getArrivalAlarmYn());
    }
}
