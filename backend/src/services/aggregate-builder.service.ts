export function buildAggs() {
    return {
        top_browsers: { terms: { field: 'browser', size: 5 } },
        top_error_messages: { terms: { field: 'errorMessage.raw', size: 5 } }
    };
}