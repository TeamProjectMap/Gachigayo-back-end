package com.baegopa.onestep.service.impl;

import com.baegopa.onestep.dto.UserDTO;
import com.baegopa.onestep.mapper.ILinkMapper;
import com.baegopa.onestep.mapper.IUserMapper;
import com.baegopa.onestep.service.ILinkService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashMap;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class LinkService implements ILinkService {

    private static final String ROLE_USER = "USER";
    private static final String ROLE_GUARDIAN = "GUARDIAN";

    private final ILinkMapper linkMapper;
    private final IUserMapper userMapper;

    @Override
    public Map<String, Object> getLinkStatus(Long userId, String userRole) {
        Map<String, Object> status = new HashMap<>();
        status.put("userRole", userRole);

        if (ROLE_USER.equals(userRole)) {
            // 이용자 화면에는 보호자에게 알려줄 연결코드도 같이 보여준다
            status.put("linkCode", userMapper.getLinkCodeByUserId(userId));

            UserDTO guardian = linkMapper.getGuardianByUserId(userId);
            status.put("linked", guardian != null);

            if (guardian != null) {
                status.put("linkedName", guardian.getUserName());
                status.put("linkedPhone", guardian.getPhone());
            }

            return status;
        }

        UserDTO linkedUser = linkMapper.getUserByGuardianId(userId);
        status.put("linked", linkedUser != null);

        if (linkedUser != null) {
            status.put("linkedName", linkedUser.getUserName());

            // 보호자 설정 화면에도 연결코드를 보여줌
            // 이용자가 코드를 다시 받으면 그 최신 코드가 보이도록 매번 조회
            status.put("linkCode", userMapper.getLinkCodeByUserId(linkedUser.getUserId()));
        }

        return status;
    }

    @Override
    @Transactional
    public String connectByLinkCode(Long guardianId, String linkCode) {
        if (isBlank(linkCode)) {
            throw new IllegalArgumentException("연결코드를 입력해주세요.");
        }

        if (linkMapper.getLinkCountByGuardianId(guardianId) > 0) {
            throw new IllegalArgumentException("이미 연결된 사용자가 있습니다. 연결을 해제한 뒤 다시 시도해주세요.");
        }

        UserDTO linkedUser = userMapper.getUserByLinkCode(linkCode.trim());

        if (linkedUser == null) {
            throw new IllegalArgumentException("유효하지 않은 연결코드입니다.");
        }

        if (guardianId.equals(linkedUser.getUserId())) {
            throw new IllegalArgumentException("본인의 연결코드는 사용할 수 없습니다.");
        }

        if (linkMapper.getLinkCountByUserId(linkedUser.getUserId()) > 0) {
            throw new IllegalArgumentException("이미 다른 보호자와 연결된 사용자입니다.");
        }

        userMapper.insertGuardianLink(linkedUser.getUserId(), guardianId);

        log.info("보호자 연결 완료 guardianId={}, userId={}", guardianId, linkedUser.getUserId());

        return linkedUser.getUserName();
    }

    @Override
    @Transactional
    public boolean disconnect(Long userId, String userRole) {
        int deleted;

        if (ROLE_USER.equals(userRole)) {
            deleted = linkMapper.deleteLinkByUserId(userId);
        } else if (ROLE_GUARDIAN.equals(userRole)) {
            deleted = linkMapper.deleteLinkByGuardianId(userId);
        } else {
            throw new IllegalArgumentException("비정상 접근입니다.");
        }

        log.info("연결 해제 처리 userId={}, userRole={}, 해제건수={}", userId, userRole, deleted);

        return deleted > 0;
    }

    private boolean isBlank(String value) {
        return value == null || value.trim().isEmpty();
    }
}
