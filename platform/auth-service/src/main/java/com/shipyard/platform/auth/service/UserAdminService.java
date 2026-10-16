package com.shipyard.platform.auth.service;

import com.shipyard.platform.auth.dto.AdminUserDto;
import com.shipyard.platform.auth.dto.CreateUserRequest;
import com.shipyard.platform.auth.dto.UpdateUserRequest;
import com.shipyard.platform.auth.entity.User;
import com.shipyard.platform.auth.repository.RefreshTokenRepository;
import com.shipyard.platform.auth.repository.UserRepository;
import com.shipyard.platform.common.enums.SystemRole;
import com.shipyard.platform.common.exception.BadRequestException;
import com.shipyard.platform.common.exception.ConflictException;
import com.shipyard.platform.common.exception.ForbiddenException;
import com.shipyard.platform.common.exception.ResourceNotFoundException;
import com.shipyard.platform.common.exception.UnauthorizedException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;

/**
 * Account administration for SYS_ADMINs, plus a user's own password change.
 * The caller's admin rights are read from the database, not the JWT, so a demotion takes effect at once.
 */
@Service
public class UserAdminService {

    public static final String ACTIVE = "ACTIVE";
    public static final String DISABLED = "DISABLED";
    private static final Set<String> STATUSES = Set.of(ACTIVE, DISABLED);

    private final UserRepository users;
    private final RefreshTokenRepository tokens;
    private final PasswordEncoder encoder;

    public UserAdminService(UserRepository users, RefreshTokenRepository tokens, PasswordEncoder encoder) {
        this.users = users;
        this.tokens = tokens;
        this.encoder = encoder;
    }

    public List<AdminUserDto> list(String actorId) {
        requireAdmin(actorId);
        return users.findAllByOrderByCreatedAtAsc().stream().map(UserAdminService::toDto).toList();
    }

    @Transactional
    public AdminUserDto create(String actorId, CreateUserRequest req) {
        requireAdmin(actorId);
        String email = req.email().trim().toLowerCase(Locale.ROOT);
        if (users.existsByEmailIgnoreCase(email)) throw new ConflictException("Email already exists: " + email);
        User u = new User("usr_" + UUID.randomUUID().toString().replace("-", "").substring(0, 12),
                email, encoder.encode(req.password()), req.fullName().trim(),
                req.systemRole() == null || req.systemRole().isBlank() ? SystemRole.USER : role(req.systemRole()));
        return toDto(users.save(u));
    }

    @Transactional
    public AdminUserDto update(String actorId, String userId, UpdateUserRequest req) {
        requireAdmin(actorId);
        User u = users.findById(userId).orElseThrow(() -> new ResourceNotFoundException("User not found"));
        boolean self = u.getId().equals(actorId);
        if (req.fullName() != null) {
            if (req.fullName().isBlank()) throw new BadRequestException("Full name must not be blank");
            u.setFullName(req.fullName().trim());
        }
        if (req.systemRole() != null) {
            SystemRole r = role(req.systemRole());
            if (self && r != SystemRole.SYS_ADMIN) throw new BadRequestException("You cannot remove your own admin role");
            u.setSystemRole(r);
        }
        if (req.status() != null) {
            String s = req.status().trim().toUpperCase(Locale.ROOT);
            if (!STATUSES.contains(s)) throw new BadRequestException("Status must be ACTIVE or DISABLED");
            if (self && DISABLED.equals(s)) throw new BadRequestException("You cannot disable your own account");
            if (DISABLED.equals(s)) tokens.revokeAllForUser(u.getId());
            else { u.setFailedLoginCount(0); u.setLockedUntil(null); }
            u.setStatus(s);
        }
        u.setUpdatedAt(Instant.now());
        return toDto(users.save(u));
    }

    @Transactional
    public void resetPassword(String actorId, String userId, String password) {
        requireAdmin(actorId);
        User u = users.findById(userId).orElseThrow(() -> new ResourceNotFoundException("User not found"));
        setPassword(u, password);
    }

    @Transactional
    public void changeOwnPassword(String actorId, String currentPassword, String newPassword) {
        User u = actor(actorId);
        if (!encoder.matches(currentPassword, u.getPasswordHash())) throw new BadRequestException("Current password is incorrect");
        setPassword(u, newPassword);
    }

    private void setPassword(User u, String password) {
        u.setPasswordHash(encoder.encode(password));
        u.setFailedLoginCount(0);
        u.setLockedUntil(null);
        u.setUpdatedAt(Instant.now());
        users.save(u);
        tokens.revokeAllForUser(u.getId()); // other devices must sign in again
    }

    private User actor(String actorId) {
        if (actorId == null || actorId.isBlank()) throw new UnauthorizedException("Unauthorized");
        User u = users.findById(actorId).orElseThrow(() -> new UnauthorizedException("Unauthorized"));
        if (!ACTIVE.equals(u.getStatus())) throw new UnauthorizedException("Account is disabled");
        return u;
    }

    private void requireAdmin(String actorId) {
        if (actor(actorId).getSystemRole() != SystemRole.SYS_ADMIN) throw new ForbiddenException("Administrator only");
    }

    private static SystemRole role(String s) {
        try { return SystemRole.valueOf(s.trim().toUpperCase(Locale.ROOT)); }
        catch (IllegalArgumentException e) { throw new BadRequestException("Unknown system role: " + s); }
    }

    static AdminUserDto toDto(User u) {
        return new AdminUserDto(u.getId(), u.getEmail(), u.getFullName(), u.getSystemRole(), u.getStatus(),
                u.getLockedUntil(), u.getCreatedAt());
    }
}
