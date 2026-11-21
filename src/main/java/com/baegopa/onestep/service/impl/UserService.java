package com.baegopa.onestep.service.impl;

import com.baegopa.onestep.dto.UserDTO;
import com.baegopa.onestep.dto.UserSettingsDTO;
import com.baegopa.onestep.mapper.ILinkMapper;
import com.baegopa.onestep.mapper.IUserMapper;
import com.baegopa.onestep.service.IUserService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;

import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class UserService implements IUserService {

    private static final String ROLE_USER = "USER";
    private static final String ROLE_GUARDIAN = "GUARDIAN";
    private static final String LINK_CODE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    private static final int LINK_CODE_RETRY_LIMIT = 20;
    private static final String PASSWORD_PATTERN = "^(?=.*[A-Za-z])(?=.*\\d)(?=.*[^A-Za-z0-9]).{8,16}$";
    private static final int HELP_REQUEST_MESSAGE_MAX_LENGTH = 500;
    /** 직접 쓴 도움요청 문구는 이만큼까지 쌓아 둔다 */
    private static final int CUSTOM_HELP_MESSAGE_MAX_COUNT = 5;

    private final IUserMapper userMapper;
    private final ILinkMapper linkMapper;
    private final BCryptPasswordEncoder passwordEncoder = new BCryptPasswordEncoder();
    private final SecureRandom secureRandom = new SecureRandom();
    private final JsonMapper jsonMapper = JsonMapper.builder().build();

    @Override
    public boolean isLoginIdDuplicated(String loginId) {
        return userMapper.getLoginIdCount(loginId) > 0;
    }

    @Override
    public boolean isEmailDuplicated(String email) {
        return userMapper.getEmailCount(email) > 0;
    }

    @Override
    public boolean isValidLinkCode(String linkCode) {
        return userMapper.getUserByLinkCode(linkCode) != null;
    }

    @Override
    public void validateLinkCode(String linkCode) {
        findLinkableUser(linkCode);
    }

    @Override
    @Transactional
    public String reissueLinkCode(Long userId) {
        String newLinkCode = createUniqueLinkCode();

        if (userMapper.updateLinkCode(userId, newLinkCode) == 0) {
            throw new IllegalArgumentException("연결코드를 다시 받을 수 없는 계정입니다.");
        }

        log.info("연결코드 재발급 userId={}, linkCode={}", userId, newLinkCode);

        return newLinkCode;
    }

    /**
     * 연결코드로 연결 대상 이용자를 찾음
     * <p>
     * 연결은 1:1 이라 이미 보호자가 있는 이용자에게는 연결할 수 없음
     */
    private UserDTO findLinkableUser(String linkCode) {
        if (isBlank(linkCode)) {
            throw new IllegalArgumentException("연결코드를 입력해주세요.");
        }

        UserDTO linkedUser = userMapper.getUserByLinkCode(linkCode.trim());

        if (linkedUser == null) {
            throw new IllegalArgumentException("유효하지 않은 연결코드입니다.");
        }

        if (linkMapper.getLinkCountByUserId(linkedUser.getUserId()) > 0) {
            throw new IllegalArgumentException("이미 다른 보호자와 연결된 사용자입니다.");
        }

        return linkedUser;
    }

    @Override
    public UserDTO login(UserDTO userDTO) {
        if (userDTO == null || isBlank(userDTO.getLoginId()) || isBlank(userDTO.getPassword())) {
            throw new IllegalArgumentException("아이디 또는 비밀번호를 확인해주세요.");
        }

        UserDTO rDTO = userMapper.getUserByLoginId(userDTO.getLoginId());
        if (rDTO == null || !passwordEncoder.matches(userDTO.getPassword(), rDTO.getPassword())) {
            throw new IllegalArgumentException("아이디 또는 비밀번호를 확인해주세요.");
        }

        log.info("로그인 성공 userId={}, loginId={}, userRole={}",
                rDTO.getUserId(), rDTO.getLoginId(), rDTO.getUserRole());

        return rDTO;
    }

    @Override
    public Map<String, Object> getHomeInfo(Long userId, String userRole) {
        Map<String, Object> result = new HashMap<>();
        result.put("userId", userId);
        result.put("userRole", userRole);

        if (isBlank(userRole) || userId == null) {
            return result;
        }

        if (ROLE_USER.equals(userRole)) {
            result.put("linkedName", userMapper.getGuardianNameByUserId(userId));
        } else if (ROLE_GUARDIAN.equals(userRole)) {
            result.put("linkedName", userMapper.getUserNameByGuardianId(userId));
        }

        return result;
    }

    @Override
    public String getHelpRequestMessage(Long userId) {
        if (userId == null) {
            return null;
        }

        UserSettingsDTO settingsDTO = userMapper.getUserSettings(userId);
        return settingsDTO == null ? null : settingsDTO.getHelpRequestMessage();
    }

    @Override
    public List<String> getCustomHelpMessages(Long userId) {
        if (userId == null) {
            return new ArrayList<>();
        }

        UserSettingsDTO settingsDTO = userMapper.getUserSettings(userId);
        String json = settingsDTO == null ? null : settingsDTO.getCustomHelpMessages();

        if (isBlank(json)) {
            return new ArrayList<>();
        }

        try {
            List<String> messages = new ArrayList<>();
            for (Object item : jsonMapper.readValue(json, List.class)) {
                if (item != null && !isBlank(item.toString())) {
                    messages.add(item.toString());
                }
            }
            return messages;
        } catch (Exception e) {
            log.warn("직접 쓴 도움요청 문구를 읽지 못했습니다. userId={}", userId, e);
            return new ArrayList<>();
        }
    }

    @Override
    @Transactional
    public List<String> saveCustomHelpMessages(Long userId, String messagesJson) {
        if (userId == null) {
            throw new IllegalArgumentException("로그인이 필요합니다.");
        }

        List<?> raw;
        try {
            raw = isBlank(messagesJson) ? List.of() : jsonMapper.readValue(messagesJson, List.class);
        } catch (Exception e) {
            throw new IllegalArgumentException("문구 목록이 올바르지 않습니다.");
        }

        // 앞뒤 공백 정리, 빈 문구·같은 문구는 하나로
        List<String> messages = new ArrayList<>();
        for (Object item : raw) {
            String message = item == null ? "" : item.toString().trim();
            if (isBlank(message) || messages.contains(message)) {
                continue;
            }
            if (message.length() > HELP_REQUEST_MESSAGE_MAX_LENGTH) {
                throw new IllegalArgumentException("도움요청 문구는 500자 이하로 입력해주세요.");
            }
            messages.add(message);
        }

        if (messages.size() > CUSTOM_HELP_MESSAGE_MAX_COUNT) {
            throw new IllegalArgumentException("직접 쓴 문구는 " + CUSTOM_HELP_MESSAGE_MAX_COUNT + "개까지 저장할 수 있어요.");
        }

        userMapper.upsertCustomHelpMessages(userId,
                messages.isEmpty() ? null : jsonMapper.writeValueAsString(messages));

        return messages;
    }

    @Override
    @Transactional
    public int saveHelpRequestMessage(Long userId, String helpRequestMessage) {
        if (userId == null) {
            throw new IllegalArgumentException("로그인이 필요합니다.");
        }

        String message = helpRequestMessage == null ? "" : helpRequestMessage.trim();
        if (isBlank(message)) {
            throw new IllegalArgumentException("도움요청 문구를 입력해주세요.");
        }

        if (message.length() > HELP_REQUEST_MESSAGE_MAX_LENGTH) {
            throw new IllegalArgumentException("도움요청 문구는 500자 이하로 입력해주세요.");
        }

        UserSettingsDTO settingsDTO = new UserSettingsDTO();
        settingsDTO.setUserId(userId);
        settingsDTO.setHelpRequestMessage(message);

        return userMapper.upsertUserSettings(settingsDTO);
    }

    @Override
    @Transactional
    public int registerUser(UserDTO userDTO) {
        validateCommonUserInfo(userDTO);

        if (isLoginIdDuplicated(userDTO.getLoginId())) {
            throw new IllegalArgumentException("이미 사용 중인 아이디입니다.");
        }

        if (isEmailDuplicated(userDTO.getEmail())) {
            throw new IllegalArgumentException("이미 사용 중인 이메일입니다.");
        }

        String linkCode = createUniqueLinkCode();
        userDTO.setUserRole(ROLE_USER);
        userDTO.setPhone(null);
        userDTO.setLinkCode(linkCode);
        userDTO.setPassword(passwordEncoder.encode(userDTO.getPassword()));

        log.info("USER 회원가입 처리 loginId={}, email={}, linkCode={}",
                userDTO.getLoginId(), userDTO.getEmail(), userDTO.getLinkCode());

        return userMapper.insertUser(userDTO);
    }

    @Override
    @Transactional
    public int registerGuardian(UserDTO userDTO, String linkCode) {
        validateCommonUserInfo(userDTO);

        if (isBlank(userDTO.getPhone())) {
            throw new IllegalArgumentException("보호자 전화번호는 필수입니다.");
        }

        if (isLoginIdDuplicated(userDTO.getLoginId())) {
            throw new IllegalArgumentException("이미 사용 중인 아이디입니다.");
        }

        if (isEmailDuplicated(userDTO.getEmail())) {
            throw new IllegalArgumentException("이미 사용 중인 이메일입니다.");
        }

        // 가입 화면에서 코드 확인을 한 뒤에도 그 사이 다른 보호자가 연결했을 수 있어 여기서 다시 봄
        UserDTO linkedUser = findLinkableUser(linkCode);

        userDTO.setUserRole(ROLE_GUARDIAN);
        userDTO.setLinkCode(null);
        userDTO.setPassword(passwordEncoder.encode(userDTO.getPassword()));

        log.info("GUARDIAN 회원가입 처리 loginId={}, email={}, linkedUserId={}",
                userDTO.getLoginId(), userDTO.getEmail(), linkedUser.getUserId());

        int result = userMapper.insertUser(userDTO);
        userMapper.insertGuardianLink(linkedUser.getUserId(), userDTO.getUserId());

        return result;
    }

    /**
     * 아이디 찾기, 비밀번호 찾기 공용 회원 조회
     * <p>
     * 이름 + 이메일만 넘어오면 아이디 찾기, 아이디까지 넘어오면 비밀번호 찾기로 동작함
     */
    @Override
    public UserDTO searchUserIdOrPassword(UserDTO userDTO) {
        if (userDTO == null || isBlank(userDTO.getUserName()) || isBlank(userDTO.getEmail())) {
            throw new IllegalArgumentException("이름과 이메일을 입력해주세요.");
        }

        UserDTO rDTO = userMapper.searchUser(userDTO);

        log.info("회원 찾기 결과 userName={}, email={}, 조회여부={}",
                userDTO.getUserName(), userDTO.getEmail(), rDTO != null);

        return rDTO;
    }

    /**
     * 비밀번호 재설정
     */
    @Override
    @Transactional
    public int newPassword(UserDTO userDTO) {
        if (userDTO == null || isBlank(userDTO.getLoginId())) {
            throw new IllegalArgumentException("비정상 접근입니다.");
        }

        if (!isValidPassword(userDTO.getPassword())) {
            throw new IllegalArgumentException("8~16자 영문, 숫자, 특수문자를 포함해주세요.");
        }

        // 비밀번호는 절대로 복호화되지 않도록 BCrypt로 암호화해서 저장함
        userDTO.setPassword(passwordEncoder.encode(userDTO.getPassword()));

        log.info("비밀번호 재설정 처리 loginId={}", userDTO.getLoginId());

        return userMapper.updatePassword(userDTO);
    }

    private boolean isValidPassword(String password) {
        return password != null && password.matches(PASSWORD_PATTERN);
    }

    private void validateCommonUserInfo(UserDTO userDTO) {
        if (userDTO == null) {
            throw new IllegalArgumentException("회원 정보가 없습니다.");
        }

        if (isBlank(userDTO.getUserName())) {
            throw new IllegalArgumentException("사용자 이름은 필수입니다.");
        }

        if (isBlank(userDTO.getLoginId())) {
            throw new IllegalArgumentException("아이디는 필수입니다.");
        }

        if (isBlank(userDTO.getPassword())) {
            throw new IllegalArgumentException("비밀번호는 필수입니다.");
        }

        if (isBlank(userDTO.getEmail())) {
            throw new IllegalArgumentException("이메일은 필수입니다.");
        }
    }

    private String createUniqueLinkCode() {
        for (int i = 0; i < LINK_CODE_RETRY_LIMIT; i++) {
            String linkCode = createLinkCode();

            if (userMapper.getLinkCodeCount(linkCode) == 0) {
                log.info("보호자 연결코드 생성 성공 linkCode={}, retryCount={}", linkCode, i);
                return linkCode;
            }

            log.info("보호자 연결코드 중복 발생 linkCode={}, retryCount={}", linkCode, i);
        }

        throw new IllegalStateException("보호자 연결코드 생성에 실패했습니다.");
    }

    private String createLinkCode() {
        StringBuilder code = new StringBuilder();

        for (int i = 0; i < 8; i++) {
            if (i == 4) {
                code.append("-");
            }

            int index = secureRandom.nextInt(LINK_CODE_CHARS.length());
            code.append(LINK_CODE_CHARS.charAt(index));
        }

        return code.toString();
    }

    private boolean isBlank(String value) {
        return value == null || value.trim().isEmpty();
    }
}
