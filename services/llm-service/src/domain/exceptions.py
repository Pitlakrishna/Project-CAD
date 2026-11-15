"""Custom exceptions for LLM service."""


class LlmServiceException(Exception):
    """Base exception for LLM service."""


class ProviderException(LlmServiceException):
    """Exception raised when LLM provider encounters an error."""


class CodeParsingException(LlmServiceException):
    """Exception raised when parsing or validating Replicad code fails."""


class SecurityViolationException(LlmServiceException):
    """Exception raised when generated code contains unsafe patterns."""
