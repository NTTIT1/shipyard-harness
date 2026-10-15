package com.shipyard.platform.auth.service;

import com.shipyard.platform.auth.dto.AuthResponse;
import com.shipyard.platform.auth.dto.LoginRequest;
import com.shipyard.platform.auth.dto.RegisterRequest;
import com.shipyard.platform.auth.entity.RefreshToken;
import com.shipyard.platform.auth.entity.User;
import com.shipyard.platform.auth.repository.RefreshTokenRepository;
import com.shipyard.platform.auth.repository.UserRepository;
import com.shipyard.platform.common.dto.UserDto;
import com.shipyard.platform.common.enums.SystemRole;
import com.shipyard.platform.common.exception.BusinessException;
import com.shipyard.platform.common.exception.ResourceNotFoundException;
import com.shipyard.platform.common.exception.UnauthorizedException;
import com.shipyard.platform.common.security.JwtUtils;
import com.shipyard.platform.common.security.SecurityConstants;
import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.UUID;

@Service
public class AuthService {

    private final UserRepository userRepository;
    private final RefreshTokenRepository refreshTokenRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtUtils jwtUtils;

    @Value("${shipyard.jwt.access-token-expiration-seconds:900}")
    private long accessTokenExpirationSeconds;

    @Value("${shipyard.jwt.refresh-token-expiration-seconds:604800}")
    private long refreshTokenExpirationSeconds;

    public AuthService(UserRepository userRepository,
                       RefreshTokenRepository refreshTokenRepository,
                       PasswordEncoder passwordEncoder,
                       @Value("${shipyard.jwt.secret:" + SecurityConstants.DEFAULT_JWT_SECRET + "}") String jwtSecret) {
        this.userRepository = userRepository;
        this.refreshTokenRepository = refreshTokenRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtUtils = new JwtUtils(jwtSecret);
    }

    @Value("${shipyard.admin.email:admin@shipyard.local}")
    private String adminEmail;

    @Value("${shipyard.admin.password:admin123}")
    private String adminPassword;

    @PostConstruct
    public void seedInitialAdmin() {
        if (!userRepository.existsByEmail(adminEmail)) {
            User admin = new User(
                    "usr_" + UUID.randomUUID().toString().replace("-", "").substring(0, 12),
                    adminEmail,
                    passwordEncoder.encode(adminPassword),
                    "System Administrator",
                    SystemRole.SYS_ADMIN
            );
            userRepository.save(admin);
        }
    }

    @Transactional
    public AuthResponse register(RegisterRequest request) {
        if (userRepository.existsByEmail(request.getEmail())) {
            throw new BusinessException("Email already registered: " + request.getEmail());
        }

        String userId = "usr_" + UUID.randomUUID().toString().replace("-", "").substring(0, 12);
        User user = new User(
                userId,
                request.getEmail(),
                passwordEncoder.encode(request.getPassword()),
                request.getFullName(),
                SystemRole.USER // self-registration never grants SYS_ADMIN
        );

        userRepository.save(user);
        return createAuthResponse(user);
    }

    // noRollbackFor: the failed-attempt counter / lock must persist even though we throw.
    @Transactional(noRollbackFor = UnauthorizedException.class)
    public AuthResponse login(LoginRequest request) {
        User user = userRepository.findByEmail(request.getEmail())
                .orElseThrow(() -> new UnauthorizedException("Invalid email or password"));

        // Check if locked
        if (user.getLockedUntil() != null && user.getLockedUntil().isAfter(Instant.now())) {
            throw new UnauthorizedException("Account is temporarily locked due to too many failed attempts. Try again later.");
        }

        if (!passwordEncoder.matches(request.getPassword(), user.getPasswordHash())) {
            int newFailedCount = user.getFailedLoginCount() + 1;
            user.setFailedLoginCount(newFailedCount);
            if (newFailedCount >= 5) {
                user.setLockedUntil(Instant.now().plusSeconds(900)); // lock 15 mins
            }
            userRepository.save(user);
            throw new UnauthorizedException("Invalid email or password");
        }

        // Reset failed count
        user.setFailedLoginCount(0);
        user.setLockedUntil(null);
        userRepository.save(user);

        return createAuthResponse(user);
    }

    @Transactional(noRollbackFor = UnauthorizedException.class)
    public AuthResponse refreshToken(String refreshTokenStr) {
        RefreshToken token = refreshTokenRepository.findByTokenHashAndRevokedFalse(refreshTokenStr)
                .orElseThrow(() -> new UnauthorizedException("Invalid or expired refresh token"));

        if (token.getExpiresAt().isBefore(Instant.now())) {
            token.setRevoked(true);
            refreshTokenRepository.save(token);
            throw new UnauthorizedException("Refresh token expired");
        }

        User user = userRepository.findById(token.getUserId())
                .orElseThrow(() -> new UnauthorizedException("User not found"));

        // Revoke old token
        token.setRevoked(true);
        refreshTokenRepository.save(token);

        return createAuthResponse(user);
    }

    @Transactional
    public void logout(String refreshTokenStr) {
        if (refreshTokenStr == null || refreshTokenStr.isBlank()) return;
        refreshTokenRepository.findByTokenHashAndRevokedFalse(refreshTokenStr).ifPresent(token -> {
            token.setRevoked(true);
            refreshTokenRepository.save(token);
        });
    }

    public java.util.List<UserDto> findUsers(java.util.Collection<String> ids) {
        if (ids.size() > 200) throw new BusinessException("At most 200 ids");
        return userRepository.findByIdIn(ids).stream().map(this::toDto).toList();
    }

    public UserDto lookupByEmail(String email) {
        return userRepository.findByEmailIgnoreCase(email.trim())
                .map(this::toDto).orElseThrow(() -> new ResourceNotFoundException("User not found"));
    }

    public UserDto getUserProfile(String userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User not found: " + userId));
        return toDto(user);
    }

    private AuthResponse createAuthResponse(User user) {
        String accessToken = jwtUtils.generateToken(
                user.getId(),
                user.getEmail(),
                user.getSystemRole().name(),
                accessTokenExpirationSeconds
        );

        String refreshTokenStr = UUID.randomUUID().toString().replace("-", "") + UUID.randomUUID().toString().replace("-", "");
        RefreshToken refreshToken = new RefreshToken(
                "tok_" + UUID.randomUUID().toString().replace("-", "").substring(0, 12),
                user.getId(),
                refreshTokenStr,
                Instant.now().plusSeconds(refreshTokenExpirationSeconds)
        );
        refreshTokenRepository.save(refreshToken);

        return new AuthResponse(accessToken, refreshTokenStr, accessTokenExpirationSeconds, toDto(user));
    }

    private UserDto toDto(User user) {
        return new UserDto(
                user.getId(),
                user.getEmail(),
                user.getFullName(),
                user.getSystemRole(),
                user.getStatus(),
                user.getCreatedAt()
        );
    }
}
