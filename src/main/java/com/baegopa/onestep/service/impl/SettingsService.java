package com.baegopa.onestep.service.impl;

import com.baegopa.onestep.dto.UserDTO;
import com.baegopa.onestep.dto.UserSettingsDTO;
import com.baegopa.onestep.mapper.ILinkMapper;
import com.baegopa.onestep.mapper.ISettingsMapper;
import com.baegopa.onestep.mapper.IUserMapper;
import com.baegopa.onestep.service.ILinkService;
import com.baegopa.onestep.service.ISettingsService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashMap;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class SettingsService implements ISettingsService {

    private static final String ROLE_GUARDIAN = "GUARDIAN";
    private static final String YES = "Y";

    /** 관계는 보호자가 직접 적는다. GUARDIAN_LINKS.relation 컬럼 길이와 같게 둔다. */
    private static final int RELATION_MAX_LENGTH = 20;

    private final ISettingsMapper settingsMapper;
    private final ILinkMapper linkMapper;
    private final IUserMapper userMapper;
    private final ILinkService linkService;

    @Override
    public Map<String, Object> getSettings(Long userId, String userRole) {
        Map<String, Object> settings = new HashMap<>();

        UserDTO me = userMapper.getUserById(userId);

        if (me != null) {
            settings.put("userName", me.getUserName());
            settings.put("phone", me.getPhone());
        }

        // 관계는 보호자에게만 있는 정보다
        if (ROLE_GUARDIAN.equals(userRole)) {
            settings.put("relation", linkMapper.getRelationByGuardianId(userId));
        }

        // 설정을 한 번도 저장한 적이 없으면 기본값은 켜짐이다 (테이블 기본값과 같다)
        UserSettingsDTO userSettings = settingsMapper.getUserSettings(userId);
        settings.put("arrivalAlarmOn",
                userSettings == null || YES.equals(userSettings.getArrivalAlarmYn()));

        settings.putAll(linkService.getLinkStatus(userId, userRole));

        return settings;
    }

    @Override
    @Transactional
    public void updateRelation(Long guardianId, String relation) {
        // 보호자가 직접 적는 값이라 목록으로 막지 않는다.
        // 비워서 보내면 관계를 지운 것으로 보고 null 로 저장한다.
        String trimmed = relation == null ? "" : relation.trim();

        if (trimmed.length() > RELATION_MAX_LENGTH) {
            throw new IllegalArgumentException(
                    "관계는 " + RELATION_MAX_LENGTH + "자까지 적을 수 있습니다.");
        }

        String toSave = trimmed.isEmpty() ? null : trimmed;

        if (linkMapper.updateRelationByGuardianId(guardianId, toSave) == 0) {
            throw new IllegalArgumentException("연결된 사용자가 없어 관계를 저장할 수 없습니다.");
        }

        log.info("관계 저장 guardianId={}, relation={}", guardianId, toSave);
    }

    @Override
    @Transactional
    public void updateArrivalAlarm(Long userId, boolean alarmOn) {
        settingsMapper.upsertArrivalAlarm(userId, alarmOn ? "Y" : "N");

        log.info("알림 설정 변경 userId={}, arrivalAlarmOn={}", userId, alarmOn);
    }
}
