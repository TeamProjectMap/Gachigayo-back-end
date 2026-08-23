package com.baegopa.onestep.service.impl;

import com.baegopa.onestep.dto.UserDTO;
import com.baegopa.onestep.mapper.IUserMapper;
import com.baegopa.onestep.service.IUserService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;

@Slf4j
@Service
@RequiredArgsConstructor
public class UserService implements IUserService {

    private static final String ROLE_USER = "USER";
    private static final String ROLE_GUARDIAN = "GUARDIAN";
    private static final int LINK_CODE_LENGTH = 8;
    private static final int LINK_CODE_RETRY_LIMIT = 20;
    private static final char[] LINK_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789".toCharArray();

    private final IUserMapper userMapper;
    private final BCryptPasswordEncoder passwordEncoder = new BCryptPasswordEncoder();
    private final SecureRandom secureRandom = new SecureRandom();

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
            throw new IllegalArgumentException("보호자 연락처는 필수입니다.");
        }

        if (isLoginIdDuplicated(userDTO.getLoginId())) {
            throw new IllegalArgumentException("이미 사용 중인 아이디입니다.");
        }

        if (isEmailDuplicated(userDTO.getEmail())) {
            throw new IllegalArgumentException("이미 사용 중인 이메일입니다.");
        }

        if (isBlank(linkCode)) {
            throw new IllegalArgumentException("연결코드를 입력해주세요.");
        }

        UserDTO linkedUser = userMapper.getUserByLinkCode(linkCode);
        if (linkedUser == null) {
            throw new IllegalArgumentException("유효하지 않은 보호자 연결코드입니다.");
        }

        userDTO.setUserRole(ROLE_GUARDIAN);
        userDTO.setLinkCode(null);
        userDTO.setPassword(passwordEncoder.encode(userDTO.getPassword()));

        log.info("GUARDIAN 회원가입 처리 loginId={}, email={}, linkedUserId={}",
                userDTO.getLoginId(), userDTO.getEmail(), linkedUser.getUserId());

        int result = userMapper.insertUser(userDTO);
        userMapper.insertGuardianLink(linkedUser.getUserId(), userDTO.getUserId());

        return result;
    }

    private void validateCommonUserInfo(UserDTO userDTO) {
        if (userDTO == null) {
            throw new IllegalArgumentException("회원 정보가 올바르지 않습니다.");
        }

        if (isBlank(userDTO.getUserName())) {
            throw new IllegalArgumentException("이름은 필수입니다.");
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

        throw new IllegalStateException("보호자 연결코드를 생성하지 못했습니다. 다시 시도해주세요.");
    }

    private String createLinkCode() {
        StringBuilder code = new StringBuilder();
        for (int i = 0; i < LINK_CODE_LENGTH; i++) {
            if (i == 4) {
                code.append('-');
            }
            code.append(LINK_CODE_CHARS[secureRandom.nextInt(LINK_CODE_CHARS.length)]);
        }
        return code.toString();
    }

    private boolean isBlank(String value) {
        return value == null || value.trim().isEmpty();
    }
}
