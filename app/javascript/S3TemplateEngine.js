/*

 Copyright (c) 2011-2013, EMC Corporation

 All rights reserved.

 Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:
 * Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.
 * Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.
 * Neither the name of the EMC Corporation nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.

 THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES,
 INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
 SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
 SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY,
 WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

 */
S3TemplateEngine = function() {
    this.templates = [];

    // find in-line HTML templates
    var i, prefix = "template\\.s3\\.";
    for ( i = 0; i < S3TemplateEngine.HTML_TEMPLATES.length; i++ ) {
        var name = S3TemplateEngine.HTML_TEMPLATES[i];
        var $template = jQuery( '#' + prefix + name );
        if ( $template.length == 0 ) throw 'Required in-line template "' + prefix + name + '" not found';
        this.templates[name] = new S3Template( name, $template.html(), this );
    }

    // fixed templates (messages)
    var templateNames = Object.keys( S3TemplateEngine.MESSAGE_TEMPLATES );
    for ( i = 0; i < templateNames.length; i++ ) {
        this.templates[templateNames[i]] = new S3Template( templateNames[i], S3TemplateEngine.MESSAGE_TEMPLATES[templateNames[i]], this );
    }
};
/**
 * Returns an s3Template of the specified name or an error if it is not found in the map of templates
 * @param name the name of the template to return
 */
S3TemplateEngine.prototype.get = function( name ) {
    var template = this.templates[name];
    if ( !template ) throw name + " not found in templates";
    return template;
};

S3TemplateEngine.HTML_TEMPLATES = [
    "modalBackground",
    "modalWindow",
    "configPage",
    "uidRow",
    "uidPage",
    "main",
    "fileRow",
    "fileRowContents",
    "fileRowLoading",
    "statusBar",
    "directoryContextMenu",
    "tagContextMenu",
    "fileContextMenu",
    "propertiesPage",
    "editablePropertyRow",
    "readonlyPropertyRow",
    "sharePage",
    "ipRow",
    "aclPage",
    "aclRow",
    "objectInfoPage",
    "objectInfoReplica",
    "directoryPage",
    "directoryItem",
    "versionsPage",
    "versionRow"
];

S3TemplateEngine.MESSAGE_TEMPLATES = {
    functionNotSupportedError: 'This function is not currently supported',
    newDirectoryNamePrompt: 'What would you like to name the new directory?',
    validNameError: '%{name} is not a valid name.\nNote: the characters "?" and "@" cannot be used in a name.',
    validPathError: "%{path} is not a valid path",
    nothingSelectedError: "Please select an item first",
    multipleFilesSelectedError: 'You can only perform this operation on one item',
    selectionContainsDirectoryError: 'This operation cannot be performed on directories.\nRemove the directories from your selection and try again.',
    directoryNotAllowedError: 'This operation cannot be performed on directories.',
    deleteItemsPrompt: 'Are you sure you want to delete the selected item(s)?',
    deleteNonEmptyDirectoryPrompt: 'The directory %{path} is not empty. If you continue, all of its contents will be deleted.',
    renameItemPrompt: 'What name would you like to give this item?',
    itemExistsPrompt: 'An object named %{name} already exists.\nWould you like to overwrite it?',
    itemExistsError: 'An object named %{name} already exists.',
    directoryExistsError: 'A directory named %{name} already exists.\nYou cannot overwrite directories.',
    tagPrompt: 'What would you like to name this tag?',
    tagEmpty: 'You must specify a tag',
    tagExists: 'There is already a property named %{tag}',
    invalidNumberError: '#{value} is not a valid number',
    userAclNamePrompt: 'What user name would you like to add?',
    groupAclNamePrompt: 'What group name would you like to add?',
    restoreVersionPrompt: 'Restoring this snapshot will revert the object to\nthe state it was at D{version.dateCreated}.\nAre you sure you want to do this?',
    restoreVersionSuccessPrompt: 'Successfully restored this object from the snapshot\ncreated D{version.dateCreated}.',
    deleteVersionPrompt: 'Are you sure you want to delete the snapshot\ntaken at D{version.dateCreated}?',
    uidSuccessPrompt: 'These credentials appear to be correct.',
    uidFailurePrompt: 'These credentials are invalid!',
    configDataCorruptPrompt: 'Your configuration data has been corrupted and will be reset.',
    deleteUidPrompt: 'Are you sure you want to delete the following UID?\n%{token.uid}',
    storageDisabledPrompt: 'Browser data storage seems to be disabled\n(are you in private browsing mode?)\nYour credentials cannot be saved,\nbut will be available until the browser window is closed.',
    bucketCors:'CORS not configured for bucket  %{bucketName}',
    configPageTitle: 'Configuration',
    uidPageTitle: 'Add UID',
    propertiesPageTitle: '%{name} properties',
    sharePageTitle: 'Share %{name}',
    aclPageTitle: 'ACL for %{name}',
    objectInfoPageTitle: 'Storage info for %{name}',
    directoryPageTitle: 'Select target directory',
    versionsPageTitle: 'Snapshots of %{name}',
    errorMessage:'Error Occured with status Code %{statusCode} and message %{message}',

    's3Error.403': 'You are not authorized to perform this action',
    's3Error.404': 'The item you\'ve requested cannot be found',
    's3Error.500': 'An unexpected server error has occured: %{message}',
    's3Error.1001': 'The server encountered an internal error. Please try again.',
    's3Error.1002': 'One or more arguments in the request were invalid.',
    's3Error.1003': 'The requested object was not found.',
    's3Error.1004': 'The specified range cannot be satisfied.',
    's3Error.1005': 'One or more metadata tags were not found for the requested object.',
    's3Error.1006': 'Operation aborted because of a conflicting operation in process against the resource. Note this error code may indicate that the system temporarily is too busy to process the request. This is a non-fatal error; you can re-try the request later.',
    's3Error.1007': 'The server encountered an internal error. Please try again.',
    's3Error.1008': 'The requested resource was not found on the server.',
    's3Error.1009': 'The method specified in the Request is not allowed for the resource identified.',
    's3Error.1010': 'The requested object size exceeds the maximum allowed upload/download size.',
    's3Error.1011': 'The specified object length does not match the actual length of the attached object.',
    's3Error.1012': 'There was a mismatch between the attached object size and the specified extent size.',
    's3Error.1013': 'The server encountered an internal error. Please try again.',
    's3Error.1014': 'The maximum allowed metadata entries per object has been exceeded.',
    's3Error.1015': 'The request could not be finished due to insufficient access privileges.',
    's3Error.1016': 'The resource you are trying to create already exists.',
    's3Error.1019': 'The server encountered an I/O error. Please try again.',
    's3Error.1020': 'The requested resource is missing or could not be found.',
    's3Error.1021': 'The requested resource is not a directory.',
    's3Error.1022': 'The requested resource is a directory.',
    's3Error.1023': 'The directory you are attempting to delete is not empty.',
    's3Error.1024': 'The server encountered an internal error. Please try again.',
    's3Error.1025': 'The server encountered an internal error. Please try again.',
    's3Error.1026': 'The server encountered an internal error. Please try again.',
    's3Error.1027': 'The server encountered an internal error. Please try again.',
    's3Error.1028': 'The server encountered an internal error. Please try again.',
    's3Error.1029': 'The server encountered an internal error. Please try again.',
    's3Error.1031': 'The request timestamp was outside the valid time window.',
    's3Error.1032': 'There was a mismatch between the signature in the request and the signature as computed by the server.\nPlease check your credentials and try again',
    's3Error.1033': 'Unable to retrieve the secret key for the specified user.',
    's3Error.1034': 'Unable to read the contents of the HTTP body.',
    's3Error.1037': 'The specified token is invalid.',
    's3Error.1040': 'The server is busy. Please try again',
    's3Error.1041': 'The requested filename length exceeds the maximum length allowed.',
    's3Error.1042': 'The requested operation is not supported.',
    's3Error.1043': 'The object has the maximum number of links',
    's3Error.1044': 'The specified parent does not exist.',
    's3Error.1045': 'The specified parent is not a directory.',
    's3Error.1046': 'The specified object is not in the namespace.',
    's3Error.1047': 'Source and target are the same file.',
    's3Error.1048': 'The target directory is not empty and may not be overwritten',
    's3Error.1049': 'The checksum sent with the request did not match the checksum as computed by the server',
    's3Error.1050': 'The requested checksum algorithm is different than the one previously used for this object.',
    's3Error.1051': 'Checksum verification may only be used with append update requests',
    's3Error.1052': 'The specified checksum algorithm is not implemented.',
    's3Error.1053': 'Checksum cannot be computed for an object on update for which one wasn\'t computed at create time.',
    's3Error.1054': 'The checksum input parameter was missing from the request.',
    's3Error.noBrowserCompat': 'This feature is not supported on your current browser by this version of s3 (%{info}).'
};
