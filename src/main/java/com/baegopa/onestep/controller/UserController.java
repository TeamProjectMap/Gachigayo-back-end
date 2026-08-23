package com.baegopa.onestep.controller;

import com.baegopa.onestep.dto.MailDTO;
import com.baegopa.onestep.dto.UserDTO;
import com.baegopa.onestep.service.IMailService;
import com.baegopa.onestep.service.IUserService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseBody;

import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;

@Slf4j
@Controller
@RequiredArgsConstructor
@RequestMapping("/user")
public class UserController {

    private static final String SESSION_EMAIL_AUTH_CODE = "emailAuthCode";
    private static final String SESSION_EMAIL_AUTH_EMAIL = "emailAuthEmail";
    private static final String SESSION_EMAIL_AUTH_VERIFIED = "emailAuthVerified";
    private static final String SESSION_EMAIL_AUTH_EXPIRE_TIME = "emailAuthExpireTime";
    private static final String SESSION_NEW_PASSWORD_LOGIN_ID = "newPasswordLoginId";

    // 아이디/비밀번호 찾기 전용 이메일 인증 세션 (회원가입 인증과 섞이지 않도록 키를 분리함)
    private static final String SESSION_FIND_AUTH_CODE = "findAuthCode";
    private static final String SESSION_FIND_AUTH_EMAIL = "findAuthEmail";
    private static final String SESSION_FIND_AUTH_EXPIRE_TIME = "findAuthExpireTime";
    private static final String SESSION_FIND_AUTH_PURPOSE = "findAuthPurpose";
    private static final String SESSION_FIND_AUTH_LOGIN_ID = "findAuthLoginId";
    private static final String SESSION_FIND_AUTH_USER_NAME = "findAuthUserName";

    private static final String FIND_PURPOSE_ID = "ID";
    private static final String FIND_PURPOSE_PASSWORD = "PASSWORD";

    private final IUserService userService;
    private final IMailService mailService;
    private final SecureRandom secureRandom = new SecureRandom();

    @ResponseBody
    @GetMapping("/session")
    public Map<String, Object> getSession(HttpSession session) {
        Long userId = (Long) session.getAttribute("SS_USER_ID");
        String userName = (String) session.getAttribute("SS_USER_NAME");
        String userRole = (String) session.getAttribute("SS_USER_ROLE");
        String loginId = (String) session.getAttribute("SS_LOGIN_ID");

        if (userId == null || isBlank(userRole)) {
            return createResponse(false, "로그인이 필요합니다.");
        }

        Map<String, Object> response = createResponse(true, "로그인 상태입니다.");
        response.put("userId", userId);
        response.put("userName", userName);
        response.put("userRole", userRole);
        response.put("loginId", loginId);

        return response;
    }

    @ResponseBody
    @GetMapping("/home-info")
    public Map<String, Object> getHomeInfo(HttpSession session) {
        Long userId = (Long) session.getAttribute("SS_USER_ID");
        String userName = (String) session.getAttribute("SS_USER_NAME");
        String userRole = (String) session.getAttribute("SS_USER_ROLE");

        if (userId == null || isBlank(userRole)) {
            return createResponse(false, "로그인이 필요합니다.");
        }

        Map<String, Object> homeInfo = userService.getHomeInfo(userId, userRole);
        Map<String, Object> response = createResponse(true, "홈 정보를 조회했습니다.");
        response.put("userId", userId);
        response.put("userName", userName);
        response.put("userRole", userRole);
        response.put("linkedName", homeInfo.get("linkedName"));

        return response;
    }

    @ResponseBody
    @PostMapping("/logout")
    public Map<String, Object> logout(HttpSession session) {
        session.invalidate();
        return createResponse(true, "로그아웃되었습니다.");
    }

    @ResponseBody
    @PostMapping("/login")
    public Map<String, Object> login(HttpServletRequest request, HttpSession session) {
        String loginId = getParameter(request, "loginId");
        String password = getParameter(request, "password");
        log.info("login request loginId={}", loginId);

        UserDTO pDTO = new UserDTO();
        pDTO.setLoginId(loginId);
        pDTO.setPassword(password);

        try {
            UserDTO rDTO = userService.login(pDTO);

            session.setAttribute("SS_USER_ID", rDTO.getUserId());
            session.setAttribute("SS_USER_NAME", rDTO.getUserName());
            session.setAttribute("SS_USER_ROLE", rDTO.getUserRole());
            session.setAttribute("SS_LOGIN_ID", rDTO.getLoginId());

            Map<String, Object> response = createResponse(true, "로그인되었습니다.");
            response.put("userRole", rDTO.getUserRole());

            return response;
        } catch (IllegalArgumentException e) {
            log.error("로그인 실패 loginId={}", loginId, e);
            return createResponse(false, "아이디 또는 비밀번호를 확인해주세요.");
        } catch (Exception e) {
            log.error("로그인 처리 중 오류 loginId={}", loginId, e);
            return createResponse(false, "로그인 처리 중 오류가 발생했습니다.");
        }
    }

    @ResponseBody
    @PostMapping("/getLoginIdExists")
    public Map<String, Object> getLoginIdExists(HttpServletRequest request) {
        String loginId = getParameter(request, "loginId");
        log.info("loginId : {}", loginId);

        if (isBlank(loginId)) {
            return createResponse(false, "아이디를 입력해주세요.");
        }

        boolean duplicated = userService.isLoginIdDuplicated(loginId);
        Map<String, Object> response = createResponse(true,
                duplicated ? "이미 사용 중인 아이디입니다." : "사용 가능한 아이디입니다.");
        response.put("duplicated", duplicated);

        return response;
    }

    @ResponseBody
    @PostMapping("/sendEmailAuth")
    public Map<String, Object> sendEmailAuth(HttpServletRequest request, HttpSession session) {
        String email = getParameter(request, "email");
        log.info("email : {}", email);

        if (isBlank(email)) {
            return createResponse(false, "이메일을 입력해주세요.");
        }

        if (userService.isEmailDuplicated(email)) {
            return createResponse(false, "이미 사용 중인 이메일입니다.");
        }

        String authCode = createEmailAuthCode();

        MailDTO pDTO = new MailDTO();
        pDTO.setToMail(email);
        pDTO.setTitle("[같이가요] 회원가입 이메일 인증번호");
        pDTO.setContents("같이가요 회원가입 이메일 인증번호는 " + authCode + "입니다.\n인증번호는 5분 이내에 입력해주세요.");

        try {
            mailService.sendMail(pDTO);

            session.setAttribute(SESSION_EMAIL_AUTH_CODE, authCode);
            session.setAttribute(SESSION_EMAIL_AUTH_EMAIL, email);
            session.setAttribute(SESSION_EMAIL_AUTH_VERIFIED, false);
            session.setAttribute(SESSION_EMAIL_AUTH_EXPIRE_TIME, LocalDateTime.now().plusMinutes(5));

            return createResponse(true, "인증번호를 발송했습니다.");
        } catch (Exception e) {
            log.error("이메일 인증번호 발송 실패 email={}", email, e);
            clearEmailAuthSession(session);
            return createResponse(false, "인증번호 발송에 실패했습니다.");
        }
    }

    @ResponseBody
    @PostMapping("/checkEmailAuth")
    public Map<String, Object> checkEmailAuth(HttpServletRequest request, HttpSession session) {
        String email = getParameter(request, "email");
        String authCode = getParameter(request, "authCode");
        log.info("email auth check email={}", email);

        String sessionEmail = (String) session.getAttribute(SESSION_EMAIL_AUTH_EMAIL);
        String sessionAuthCode = (String) session.getAttribute(SESSION_EMAIL_AUTH_CODE);
        LocalDateTime expireTime = (LocalDateTime) session.getAttribute(SESSION_EMAIL_AUTH_EXPIRE_TIME);

        if (sessionEmail == null || sessionAuthCode == null || expireTime == null) {
            return createResponse(false, "인증정보가 올바르지 않습니다.");
        }

        if (LocalDateTime.now().isAfter(expireTime)) {
            clearEmailAuthSession(session);
            return createResponse(false, "인증시간이 만료되었습니다. 인증번호를 다시 받아주세요.");
        }

        if (!isBlank(email) && !isBlank(authCode)
                && email.equals(sessionEmail) && authCode.equals(sessionAuthCode)) {
            session.setAttribute(SESSION_EMAIL_AUTH_VERIFIED, true);
            session.removeAttribute(SESSION_EMAIL_AUTH_CODE);
            session.removeAttribute(SESSION_EMAIL_AUTH_EXPIRE_TIME);
            return createResponse(true, "인증이 완료되었습니다.");
        }

        return createResponse(false, "인증정보가 올바르지 않습니다.");
    }

    @ResponseBody
    @PostMapping("/checkLinkCode")
    public Map<String, Object> checkLinkCode(HttpServletRequest request) {
        String linkCode = getParameter(request, "linkCode");
        log.info("linkCode : {}", linkCode);

        if (isBlank(linkCode)) {
            return createResponse(false, "연결코드를 입력해주세요.");
        }

        boolean valid = userService.isValidLinkCode(linkCode);

        return createResponse(valid, valid ? "연결코드가 확인되었습니다." : "유효하지 않은 코드입니다.");
    }

    @ResponseBody
    @PostMapping("/registerUser")
    public Map<String, Object> registerUser(HttpServletRequest request, HttpSession session) {
        String userName = getParameter(request, "userName");
        String loginId = getParameter(request, "loginId");
        String email = getParameter(request, "email");
        String password = getParameter(request, "password");

        log.info("USER register request userName={}, loginId={}, email={}", userName, loginId, email);

        if (!isEmailAuthVerified(session, email)) {
            return createResponse(false, "이메일 인증을 완료해주세요.");
        }

        UserDTO pDTO = new UserDTO();
        pDTO.setUserName(userName);
        pDTO.setLoginId(loginId);
        pDTO.setEmail(email);
        pDTO.setPassword(password);

        try {
            userService.registerUser(pDTO);
            clearEmailAuthSession(session);

            Map<String, Object> response = createResponse(true, "회원가입이 완료되었습니다.");
            response.put("linkCode", pDTO.getLinkCode());

            return response;
        } catch (IllegalArgumentException e) {
            log.error("USER 회원가입 실패 loginId={}, email={}", loginId, email, e);
            return createResponse(false, e.getMessage());
        } catch (Exception e) {
            log.error("USER 회원가입 처리 중 오류 loginId={}, email={}", loginId, email, e);
            return createResponse(false, "회원가입 처리 중 오류가 발생했습니다.");
        }
    }

    @ResponseBody
    @PostMapping("/registerGuardian")
    public Map<String, Object> registerGuardian(HttpServletRequest request, HttpSession session) {
        String linkCode = getParameter(request, "linkCode");
        String userName = getParameter(request, "userName");
        String loginId = getParameter(request, "loginId");
        String email = getParameter(request, "email");
        String password = getParameter(request, "password");
        String phone = getParameter(request, "phone");

        log.info("GUARDIAN register request userName={}, loginId={}, email={}, linkCode={}",
                userName, loginId, email, linkCode);

        if (!isEmailAuthVerified(session, email)) {
            return createResponse(false, "이메일 인증을 완료해주세요.");
        }

        UserDTO pDTO = new UserDTO();
        pDTO.setUserName(userName);
        pDTO.setLoginId(loginId);
        pDTO.setEmail(email);
        pDTO.setPassword(password);
        pDTO.setPhone(phone);

        try {
            userService.registerGuardian(pDTO, linkCode);
            clearEmailAuthSession(session);

            return createResponse(true, "보호자 연결이 완료되었습니다.");
        } catch (IllegalArgumentException e) {
            log.error("GUARDIAN 회원가입 실패 loginId={}, email={}", loginId, email, e);
            return createResponse(false, e.getMessage());
        } catch (Exception e) {
            log.error("GUARDIAN 회원가입 처리 중 오류 loginId={}, email={}", loginId, email, e);
            return createResponse(false, "회원가입 처리 중 오류가 발생했습니다.");
        }
    }

    /**
     * 아이디 찾기 1단계 : 이름 + 이메일이 DB 정보와 일치하면 그 이메일로 인증번호를 발송함
     * <p>
     * 본인 이메일임을 확인해야 아이디를 알려주기 위해 인증 단계를 둠
     */
    @ResponseBody
    @PostMapping("/sendFindIdAuth")
    public Map<String, Object> sendFindIdAuth(HttpServletRequest request, HttpSession session) {
        String userName = getParameter(request, "userName");
        String email = getParameter(request, "email");

        log.info("sendFindIdAuth request userName={}, email={}", userName, email);

        clearFindAuthSession(session);

        if (isBlank(userName)) {
            return createResponse(false, "이름을 입력해주세요.");
        }

        if (isBlank(email)) {
            return createResponse(false, "이메일을 입력해주세요.");
        }

        UserDTO pDTO = new UserDTO();
        pDTO.setUserName(userName);
        pDTO.setEmail(email);

        return sendFindAuth(session, pDTO, FIND_PURPOSE_ID, "입력하신 정보와 일치하는 아이디가 없습니다.");
    }

    /**
     * 아이디 찾기 2단계 : 인증번호가 일치하면 아이디를 알려줌
     */
    @ResponseBody
    @PostMapping("/searchLoginId")
    public Map<String, Object> searchLoginId(HttpServletRequest request, HttpSession session) {
        String authCode = getParameter(request, "authCode");

        log.info("searchLoginId request");

        Map<String, Object> authResult = checkFindAuth(session, authCode, FIND_PURPOSE_ID);
        if (authResult != null) {
            return authResult;
        }

        String loginId = (String) session.getAttribute(SESSION_FIND_AUTH_LOGIN_ID);
        String userName = (String) session.getAttribute(SESSION_FIND_AUTH_USER_NAME);

        // 아이디를 알려줬으면 인증정보는 더 이상 필요 없으므로 제거
        clearFindAuthSession(session);

        Map<String, Object> response = createResponse(true, "아이디를 찾았습니다.");
        response.put("userName", userName);
        response.put("loginId", loginId);

        return response;
    }

    /**
     * 비밀번호 찾기 1단계 : 아이디 + 이름 + 이메일이 DB 정보와 일치하면 그 이메일로 인증번호를 발송함
     */
    @ResponseBody
    @PostMapping("/sendFindPasswordAuth")
    public Map<String, Object> sendFindPasswordAuth(HttpServletRequest request, HttpSession session) {
        String loginId = getParameter(request, "loginId");
        String userName = getParameter(request, "userName");
        String email = getParameter(request, "email");

        log.info("sendFindPasswordAuth request loginId={}, userName={}, email={}", loginId, userName, email);

        // 예상치 못한 접근으로 세션 값이 남아있을 수 있어 먼저 제거함
        clearFindAuthSession(session);
        session.removeAttribute(SESSION_NEW_PASSWORD_LOGIN_ID);

        if (isBlank(loginId)) {
            return createResponse(false, "아이디를 입력해주세요.");
        }

        if (isBlank(userName)) {
            return createResponse(false, "이름을 입력해주세요.");
        }

        if (isBlank(email)) {
            return createResponse(false, "이메일을 입력해주세요.");
        }

        UserDTO pDTO = new UserDTO();
        pDTO.setLoginId(loginId);
        pDTO.setUserName(userName);
        pDTO.setEmail(email);

        return sendFindAuth(session, pDTO, FIND_PURPOSE_PASSWORD, "입력하신 정보와 일치하는 회원이 없습니다.");
    }

    /**
     * 비밀번호 찾기 2단계 : 인증번호가 일치하면 비밀번호 재설정 단계로 진입시킴
     */
    @ResponseBody
    @PostMapping("/searchPassword")
    public Map<String, Object> searchPassword(HttpServletRequest request, HttpSession session) {
        String authCode = getParameter(request, "authCode");

        log.info("searchPassword request");

        Map<String, Object> authResult = checkFindAuth(session, authCode, FIND_PURPOSE_PASSWORD);
        if (authResult != null) {
            return authResult;
        }

        String loginId = (String) session.getAttribute(SESSION_FIND_AUTH_LOGIN_ID);
        String userName = (String) session.getAttribute(SESSION_FIND_AUTH_USER_NAME);

        clearFindAuthSession(session);

        /*
         * 비밀번호 재설정은 보안을 위해 반드시 이메일 인증을 통과한 세션이 존재할 때만 가능하도록 구현함
         * 조회된 아이디를 세션에 저장하는 이유는 newPassword 함수에서 사용하기 위함
         */
        session.setAttribute(SESSION_NEW_PASSWORD_LOGIN_ID, loginId);

        Map<String, Object> response = createResponse(true, "이메일 인증이 완료되었습니다.");
        response.put("userName", userName);

        return response;
    }

    /**
     * 비밀번호 재설정 : 비밀번호 찾기를 통과한 세션이 있어야만 수행됨
     */
    @ResponseBody
    @PostMapping("/newPassword")
    public Map<String, Object> newPassword(HttpServletRequest request, HttpSession session) {
        String password = getParameter(request, "password");

        // 정상적인 접근인지 체크
        String loginId = (String) session.getAttribute(SESSION_NEW_PASSWORD_LOGIN_ID);

        if (isBlank(loginId)) {
            log.info("newPassword 비정상 접근 발생");
            return createResponse(false, "비정상 접근입니다. 비밀번호 찾기부터 다시 진행해주세요.");
        }

        log.info("newPassword request loginId={}", loginId);

        UserDTO pDTO = new UserDTO();
        pDTO.setLoginId(loginId);
        pDTO.setPassword(password);

        try {
            userService.newPassword(pDTO);
            session.removeAttribute(SESSION_NEW_PASSWORD_LOGIN_ID);

            return createResponse(true, "비밀번호가 재설정되었습니다.");
        } catch (IllegalArgumentException e) {
            log.error("비밀번호 재설정 실패 loginId={}", loginId, e);
            return createResponse(false, e.getMessage());
        } catch (Exception e) {
            log.error("비밀번호 재설정 처리 중 오류 loginId={}", loginId, e);
            return createResponse(false, "비밀번호 재설정 처리 중 오류가 발생했습니다.");
        }
    }

    /**
     * 아이디/비밀번호 찾기 공용 : 회원 조회 후 일치하면 인증번호를 발송하고 세션에 인증정보를 저장함
     */
    private Map<String, Object> sendFindAuth(HttpSession session, UserDTO pDTO, String purpose, String notFoundMessage) {
        UserDTO rDTO;

        try {
            rDTO = userService.searchUserIdOrPassword(pDTO);
        } catch (IllegalArgumentException e) {
            log.error("회원 찾기 실패 purpose={}", purpose, e);
            return createResponse(false, e.getMessage());
        } catch (Exception e) {
            log.error("회원 찾기 처리 중 오류 purpose={}", purpose, e);
            return createResponse(false, "회원 조회 중 오류가 발생했습니다.");
        }

        if (rDTO == null || isBlank(rDTO.getLoginId())) {
            return createResponse(false, notFoundMessage);
        }

        String authCode = createEmailAuthCode();
        String email = pDTO.getEmail();

        MailDTO mDTO = new MailDTO();
        mDTO.setToMail(email);
        mDTO.setTitle(FIND_PURPOSE_ID.equals(purpose)
                ? "[같이가요] 아이디 찾기 인증번호"
                : "[같이가요] 비밀번호 찾기 인증번호");
        mDTO.setContents(createFindAuthMailContents(rDTO.getUserName(), purpose, authCode));

        try {
            mailService.sendMail(mDTO);
        } catch (Exception e) {
            log.error("찾기 인증번호 발송 실패 email={}", email, e);
            clearFindAuthSession(session);
            return createResponse(false, "인증번호 발송에 실패했습니다.");
        }

        session.setAttribute(SESSION_FIND_AUTH_CODE, authCode);
        session.setAttribute(SESSION_FIND_AUTH_EMAIL, email);
        session.setAttribute(SESSION_FIND_AUTH_EXPIRE_TIME, LocalDateTime.now().plusMinutes(5));
        session.setAttribute(SESSION_FIND_AUTH_PURPOSE, purpose);
        session.setAttribute(SESSION_FIND_AUTH_LOGIN_ID, rDTO.getLoginId());
        session.setAttribute(SESSION_FIND_AUTH_USER_NAME, rDTO.getUserName());

        return createResponse(true, "입력하신 이메일로 인증번호를 발송했습니다.");
    }

    private String createFindAuthMailContents(String userName, String purpose, String authCode) {
        String job = FIND_PURPOSE_ID.equals(purpose) ? "아이디 찾기" : "비밀번호 찾기";

        return (userName == null ? "" : userName) + "님의 " + job + " 인증번호는 " + authCode + "입니다."
                + "\n인증번호는 5분 이내에 입력해주세요.";
    }

    /**
     * 아이디/비밀번호 찾기 공용 : 인증번호 검증
     *
     * @return 검증에 실패하면 실패 응답, 통과하면 null
     */
    private Map<String, Object> checkFindAuth(HttpSession session, String authCode, String purpose) {
        String sessionAuthCode = (String) session.getAttribute(SESSION_FIND_AUTH_CODE);
        String sessionPurpose = (String) session.getAttribute(SESSION_FIND_AUTH_PURPOSE);
        LocalDateTime expireTime = (LocalDateTime) session.getAttribute(SESSION_FIND_AUTH_EXPIRE_TIME);

        if (sessionAuthCode == null || expireTime == null || !purpose.equals(sessionPurpose)) {
            log.info("찾기 인증 비정상 접근 발생 purpose={}", purpose);
            return createResponse(false, "인증번호를 먼저 발송해주세요.");
        }

        if (LocalDateTime.now().isAfter(expireTime)) {
            clearFindAuthSession(session);
            return createResponse(false, "인증시간이 만료되었습니다. 인증번호를 다시 받아주세요.");
        }

        if (isBlank(authCode)) {
            return createResponse(false, "인증번호를 입력해주세요.");
        }

        if (!authCode.equals(sessionAuthCode)) {
            return createResponse(false, "인증번호가 올바르지 않습니다.");
        }

        return null;
    }

    private void clearFindAuthSession(HttpSession session) {
        session.removeAttribute(SESSION_FIND_AUTH_CODE);
        session.removeAttribute(SESSION_FIND_AUTH_EMAIL);
        session.removeAttribute(SESSION_FIND_AUTH_EXPIRE_TIME);
        session.removeAttribute(SESSION_FIND_AUTH_PURPOSE);
        session.removeAttribute(SESSION_FIND_AUTH_LOGIN_ID);
        session.removeAttribute(SESSION_FIND_AUTH_USER_NAME);
    }

    private String createEmailAuthCode() {
        return String.format("%06d", secureRandom.nextInt(1000000));
    }

    private boolean isEmailAuthVerified(HttpSession session, String email) {
        Object verified = session.getAttribute(SESSION_EMAIL_AUTH_VERIFIED);
        String sessionEmail = (String) session.getAttribute(SESSION_EMAIL_AUTH_EMAIL);

        return Boolean.TRUE.equals(verified) && !isBlank(email) && email.equals(sessionEmail);
    }

    private void clearEmailAuthSession(HttpSession session) {
        session.removeAttribute(SESSION_EMAIL_AUTH_CODE);
        session.removeAttribute(SESSION_EMAIL_AUTH_EMAIL);
        session.removeAttribute(SESSION_EMAIL_AUTH_VERIFIED);
        session.removeAttribute(SESSION_EMAIL_AUTH_EXPIRE_TIME);
    }

    private Map<String, Object> createResponse(boolean success, String message) {
        Map<String, Object> response = new HashMap<>();
        response.put("success", success);
        response.put("message", message);

        return response;
    }

    private String getParameter(HttpServletRequest request, String name) {
        String value = request.getParameter(name);
        return value == null ? null : value.trim();
    }

    private boolean isBlank(String value) {
        return value == null || value.trim().isEmpty();
    }
}
